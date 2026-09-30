/**
 * Seals a tdata directory into a single authenticated, encrypted container and back.
 *
 * Container layout:
 *   "HGMSEAL1" | salt(16) | frame*
 *   frame  = u32be(len) | AES-256-GCM(record) | tag(16),  nonce = 0x00000000 | u64be(counter)
 *   record = 0x01 u16be(pathLen) path u64be(size)   — file header
 *          | 0x02 bytes                             — file data
 *          | 0x03 u32be(fileCount)                  — trailer (detects truncation)
 *
 * The per-container key is HKDF(accountKey, salt), so a counter nonce never repeats.
 *
 * `user_data*` holds Telegram's media cache. It is already encrypted with Telegram's
 * local key, and that key (key_datas) goes into the container, so the cache is left
 * in place instead of re-encrypting gigabytes on every lock.
 *
 * Crash safety: the container is written to a temp file and renamed into place, and
 * only then is the plaintext removed; unsealing removes the container last. Hence
 * "container exists" always means "container is complete and authoritative".
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { subkey } from './crypto'
import { exists } from './fsx'

const MAGIC = Buffer.from('HGMSEAL1', 'ascii')
const SALT_BYTES = 16
const TAG_BYTES = 16
const CHUNK = 1 << 20
const MAX_FRAME = CHUNK + 64

const REC_FILE = 1
const REC_DATA = 2
const REC_END = 3

const SKIPPED_DIRS = [/^user_data/, /^emoji$/, /^dumps$/, /^temp$/, /^tdummy$/]
const isSkippedDir = (name: string): boolean => SKIPPED_DIRS.some((re) => re.test(name))

function nonceFor(counter: bigint): Buffer {
  const nonce = Buffer.alloc(12)
  nonce.writeBigUInt64BE(counter, 4)
  return nonce
}

/** Relative POSIX paths of every regular file that belongs in the container. */
async function listSealable(root: string, prefix = ''): Promise<string[]> {
  const result: string[] = []
  let entries
  try {
    entries = await fs.readdir(join(root, prefix), { withFileTypes: true })
  } catch {
    return result
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (!prefix && isSkippedDir(entry.name)) continue
      result.push(...(await listSealable(root, rel)))
    } else if (entry.isFile()) {
      result.push(rel)
    }
  }
  return result.sort()
}

async function removePlaintext(tdataDir: string): Promise<void> {
  for (const rel of await listSealable(tdataDir)) {
    await fs.rm(join(tdataDir, rel), { force: true })
  }
  await pruneEmptyDirs(tdataDir, true)
}

async function pruneEmptyDirs(dir: string, isRoot: boolean): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !(isRoot && isSkippedDir(entry.name))) {
      await pruneEmptyDirs(join(dir, entry.name), false)
    }
  }
  if (!isRoot) await fs.rmdir(dir).catch(() => undefined)
}

class FrameWriter {
  private counter = 0n
  constructor(
    private readonly handle: FileHandle,
    private readonly key: Buffer
  ) {}

  async write(record: Buffer): Promise<void> {
    const cipher = createCipheriv('aes-256-gcm', this.key, nonceFor(this.counter++))
    const body = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(body.length - TAG_BYTES)
    await this.handle.write(Buffer.concat([length, body]))
  }
}

class FrameReader {
  private counter = 0n
  constructor(
    private readonly handle: FileHandle,
    private readonly key: Buffer
  ) {}

  private async readExact(size: number): Promise<Buffer> {
    const buffer = Buffer.alloc(size)
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await this.handle.read(buffer, offset, size - offset, null)
      if (bytesRead === 0) throw new Error('sealed container is truncated')
      offset += bytesRead
    }
    return buffer
  }

  async read(): Promise<Buffer> {
    const length = (await this.readExact(4)).readUInt32BE()
    if (length > MAX_FRAME) throw new Error('sealed container is corrupt')
    const body = await this.readExact(length + TAG_BYTES)
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonceFor(this.counter++))
    decipher.setAuthTag(body.subarray(length))
    return Buffer.concat([decipher.update(body.subarray(0, length)), decipher.final()])
  }
}

export const isSealed = (containerPath: string): Promise<boolean> => exists(containerPath)

/** Encrypts `tdataDir` into `containerPath` and removes the plaintext. Idempotent. */
export async function sealTdata(
  tdataDir: string,
  containerPath: string,
  accountKey: Buffer
): Promise<void> {
  if (await isSealed(containerPath)) {
    // A previous seal or an interrupted unseal: the container wins.
    await removePlaintext(tdataDir)
    return
  }
  const files = await listSealable(tdataDir)
  if (files.length === 0) return

  const salt = randomBytes(SALT_BYTES)
  const key = subkey(accountKey, 'hangram:seal:v1', salt)
  const tmp = `${containerPath}.tmp`
  const out = await fs.open(tmp, 'w', 0o600)
  try {
    await out.write(Buffer.concat([MAGIC, salt]))
    const writer = new FrameWriter(out, key)
    const chunk = Buffer.alloc(CHUNK)
    for (const rel of files) {
      const source = await fs.open(join(tdataDir, rel), 'r')
      try {
        const { size } = await source.stat()
        const path = Buffer.from(rel, 'utf8')
        const header = Buffer.alloc(3 + path.length + 8)
        header.writeUInt8(REC_FILE, 0)
        header.writeUInt16BE(path.length, 1)
        path.copy(header, 3)
        header.writeBigUInt64BE(BigInt(size), 3 + path.length)
        await writer.write(header)

        let remaining = size
        while (remaining > 0) {
          const { bytesRead } = await source.read(chunk, 0, Math.min(CHUNK, remaining), null)
          if (bytesRead === 0) throw new Error(`file shrank while sealing: ${rel}`)
          await writer.write(Buffer.concat([Buffer.of(REC_DATA), chunk.subarray(0, bytesRead)]))
          remaining -= bytesRead
        }
      } finally {
        await source.close()
      }
    }
    const trailer = Buffer.alloc(5)
    trailer.writeUInt8(REC_END, 0)
    trailer.writeUInt32BE(files.length, 1)
    await writer.write(trailer)
    await out.sync()
  } catch (error) {
    await out.close()
    await fs.rm(tmp, { force: true })
    throw error
  }
  await out.close()
  await fs.rename(tmp, containerPath)
  await removePlaintext(tdataDir)
}

function safeJoin(root: string, rel: string): string {
  const parts = rel.split('/')
  if (rel.length === 0 || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('sealed container holds an unsafe path')
  }
  if (rel.includes('\\') || rel.includes('\0')) throw new Error('sealed container holds an unsafe path')
  return join(root, parts.join(sep))
}

/**
 * Decrypts `containerPath` into `targetDir`. With `keepContainer` the container is left
 * untouched (used for exports); otherwise it is removed once everything is on disk.
 */
export async function unsealTdata(
  containerPath: string,
  targetDir: string,
  accountKey: Buffer,
  options: { keepContainer?: boolean } = {}
): Promise<void> {
  if (!(await isSealed(containerPath))) return
  const input = await fs.open(containerPath, 'r')
  let current: { handle: FileHandle; remaining: bigint; rel: string } | null = null
  try {
    const head = Buffer.alloc(MAGIC.length + SALT_BYTES)
    const { bytesRead } = await input.read(head, 0, head.length, null)
    if (bytesRead !== head.length || !head.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('not a sealed container')
    }
    const reader = new FrameReader(input, subkey(accountKey, 'hangram:seal:v1', head.subarray(MAGIC.length)))
    let count = 0
    for (;;) {
      const record = await reader.read()
      const type = record.readUInt8(0)
      if (type === REC_DATA) {
        if (!current) throw new Error('sealed container is corrupt')
        const data = record.subarray(1)
        await current.handle.write(data)
        current.remaining -= BigInt(data.length)
        if (current.remaining < 0n) throw new Error('sealed container is corrupt')
        continue
      }
      if (current) {
        if (current.remaining !== 0n) throw new Error(`sealed file is incomplete: ${current.rel}`)
        await current.handle.sync()
        await current.handle.close()
        current = null
      }
      if (type === REC_END) {
        if (record.readUInt32BE(1) !== count) throw new Error('sealed container is incomplete')
        break
      }
      if (type !== REC_FILE) throw new Error('sealed container is corrupt')
      const pathLength = record.readUInt16BE(1)
      const rel = record.subarray(3, 3 + pathLength).toString('utf8')
      const size = record.readBigUInt64BE(3 + pathLength)
      const target = safeJoin(targetDir, rel)
      await fs.mkdir(dirname(target), { recursive: true })
      current = { handle: await fs.open(target, 'w', 0o600), remaining: size, rel }
      count++
    }
  } finally {
    await current?.handle.close().catch(() => undefined)
    await input.close()
  }
  if (!options.keepContainer) await fs.rm(containerPath)
}
