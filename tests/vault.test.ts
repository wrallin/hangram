import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Biometric } from '../src/main/core/biometric'
import { exists } from '../src/main/core/fsx'
import { sealTdata, unsealTdata } from '../src/main/core/sealer'
import { Vault } from '../src/main/core/vault'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hangram-vault-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('sealer', () => {
  const populate = async (tdata: string): Promise<Map<string, Buffer>> => {
    const files = new Map<string, Buffer>([
      ['key_datas', randomBytes(388)],
      ['settingss', randomBytes(100)],
      ['D877F783D5D3EF8Cs', randomBytes(300)],
      ['D877F783D5D3EF8C/maps', randomBytes(64)],
      ['D877F783D5D3EF8C/big', randomBytes((1 << 20) * 2 + 12345)],
      ['D877F783D5D3EF8C/empty', Buffer.alloc(0)]
    ])
    for (const [rel, data] of files) {
      await mkdir(join(tdata, rel, '..'), { recursive: true })
      await writeFile(join(tdata, rel), data)
    }
    await mkdir(join(tdata, 'user_data/cache'), { recursive: true })
    await writeFile(join(tdata, 'user_data/cache/blob'), 'cache')
    return files
  }

  it('seals, removes plaintext, keeps the cache, and restores byte-for-byte', async () => {
    const tdata = join(dir, 'tdata')
    const container = join(dir, 'tdata.sealed')
    const key = randomBytes(32)
    const files = await populate(tdata)

    await sealTdata(tdata, container, key)
    expect(await exists(container)).toBe(true)
    expect(await readdir(tdata)).toEqual(['user_data'])
    const sealed = await readFile(container)
    expect(sealed.includes(files.get('key_datas')!.subarray(0, 32))).toBe(false)

    await unsealTdata(container, tdata, key)
    expect(await exists(container)).toBe(false)
    for (const [rel, data] of files) {
      expect((await readFile(join(tdata, rel))).equals(data)).toBe(true)
    }
    expect(await readFile(join(tdata, 'user_data/cache/blob'), 'utf8')).toBe('cache')
  })

  it('refuses a wrong key and a tampered or truncated container, leaving it in place', async () => {
    const tdata = join(dir, 'tdata')
    const container = join(dir, 'tdata.sealed')
    const key = randomBytes(32)
    await populate(tdata)
    await sealTdata(tdata, container, key)
    const original = await readFile(container)

    await expect(unsealTdata(container, tdata, randomBytes(32))).rejects.toThrow()

    const tampered = Buffer.from(original)
    tampered[tampered.length - 40]! ^= 1
    await writeFile(container, tampered)
    await expect(unsealTdata(container, tdata, key)).rejects.toThrow()

    await writeFile(container, original.subarray(0, original.length - 21))
    await expect(unsealTdata(container, tdata, key)).rejects.toThrow()

    await writeFile(container, original)
    await unsealTdata(container, tdata, key)
    expect(await exists(join(tdata, 'key_datas'))).toBe(true)
  })

  it('treats an existing container as authoritative after a crash', async () => {
    const tdata = join(dir, 'tdata')
    const container = join(dir, 'tdata.sealed')
    const key = randomBytes(32)
    const files = await populate(tdata)
    await sealTdata(tdata, container, key)
    // Simulate an unseal that died half-way: stray partial plaintext next to the container.
    await mkdir(tdata, { recursive: true })
    await writeFile(join(tdata, 'key_datas'), 'partial')
    await sealTdata(tdata, container, key)
    expect(await exists(join(tdata, 'key_datas'))).toBe(false)
    await unsealTdata(container, tdata, key)
    expect((await readFile(join(tdata, 'key_datas'))).equals(files.get('key_datas')!)).toBe(true)
  })
})

describe('vault', () => {
  const vault = (): Vault => new Vault(dir, new Biometric(null))

  it('enables, locks, unlocks with the right PIN only, and keeps subkeys stable', async () => {
    const a = vault()
    await a.load()
    expect(a.enabled).toBe(false)
    expect(a.key('db')).toBeNull()

    await a.enable('1234')
    const key = a.key('db')!
    a.lock()
    expect(a.locked).toBe(true)
    expect(() => a.key('db')).toThrow()

    const b = vault()
    await b.load()
    expect(b.locked).toBe(true)
    expect(await b.unlock('0000')).toBe(false)
    expect(await b.unlock('1234')).toBe(true)
    expect(b.key('db')!.equals(key)).toBe(true)
    expect(b.key('other')!.equals(key)).toBe(false)
    expect((await readFile(join(dir, 'vault.json'), 'utf8')).includes(key.toString('base64'))).toBe(false)
  })

  it('changes the PIN without changing the master key', async () => {
    const a = vault()
    await a.enable('1234')
    const key = a.key('db')!
    await expect(a.changePin('9999', '5678')).rejects.toThrow()
    await a.changePin('1234', '5678')
    a.lock()
    expect(await a.unlock('1234')).toBe(false)
    expect(await a.unlock('5678')).toBe(true)
    expect(a.key('db')!.equals(key)).toBe(true)
  })

  it('disables cleanly', async () => {
    const a = vault()
    await a.enable('1234')
    await a.disable()
    expect(a.enabled).toBe(false)
    expect(await exists(join(dir, 'vault.json'))).toBe(false)
  })
})
