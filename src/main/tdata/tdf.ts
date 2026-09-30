/** "TDF$" container: magic | version(i32le) | data | md5(data | len(i32le) | version | magic). */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { readFileIfExists } from '../core/fsx'

const MAGIC = Buffer.from('TDF$', 'ascii')
/** Stamped into files we write; any Telegram Desktop ≥ 4.8 accepts it. */
const WRITE_VERSION = 4_008_000

function digest(data: Buffer, version: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeInt32LE(data.length)
  return createHash('md5').update(data).update(length).update(version).update(MAGIC).digest()
}

function parse(file: Buffer): Buffer | null {
  if (file.length < 24 || !file.subarray(0, 4).equals(MAGIC)) return null
  const version = file.subarray(4, 8)
  const data = file.subarray(8, file.length - 16)
  return digest(data, version).equals(file.subarray(file.length - 16)) ? data : null
}

/** Telegram keeps up to three generations of a file: `<name>s`, `<name>1`, `<name>0`. */
export async function readTdf(basePath: string): Promise<Buffer | null> {
  for (const suffix of ['s', '1', '0']) {
    const file = await readFileIfExists(basePath + suffix)
    const data = file && parse(file)
    if (data) return data
  }
  return null
}

export async function writeTdf(basePath: string, data: Buffer): Promise<void> {
  const version = Buffer.alloc(4)
  version.writeInt32LE(WRITE_VERSION)
  await fs.writeFile(basePath + 's', Buffer.concat([MAGIC, version, data, digest(data, version)]), {
    mode: 0o600
  })
}
