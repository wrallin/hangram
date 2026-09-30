import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Core } from '../src/main/app'
import { exists } from '../src/main/core/fsx'
import { readTdata, writeTdata } from '../src/main/tdata/tdata'

let root: string
let dataDir: string

const makeCore = (): Core =>
  new Core({
    dataDir,
    resourcesDir: join(root, 'no-resources'),
    version: 'test',
    accent: () => null,
    onState: () => undefined,
    locale: () => 'en',
    onLogin: () => undefined
  })

async function makeTdata(name: string, userId: bigint): Promise<{ dir: string; authKey: Buffer }> {
  const dir = join(root, name, 'tdata')
  const authKey = randomBytes(256)
  await writeTdata(dir, { userId, dcId: 2, authKey })
  return { dir, authKey }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'hangram-core-'))
  dataDir = join(root, 'data')
})
afterEach(() => rm(root, { recursive: true, force: true }))

describe('core', () => {
  it('imports tdata (from the folder itself or its parent) and reads the identity offline', async () => {
    const core = makeCore()
    await core.start()
    const first = await makeTdata('one', 111n)
    const second = await makeTdata('two', 222n)

    const a = await core.accounts.importTdata(first.dir)
    const b = await core.accounts.importTdata(join(root, 'two'))
    expect(core.state().accounts.map((account) => account.userId).sort()).toEqual(['111', '222'])
    expect(core.store.get(a)).toMatchObject({ dcId: 2, innerAccounts: 1, source: 'tdata', passcodeProtected: false })
    expect(b).not.toBe(a)

    await expect(core.accounts.importTdata(first.dir)).rejects.toThrow(/already added/)
    await expect(core.accounts.importTdata(root)).rejects.toThrow(/key_datas/)
  })

  it('keeps everything sealed at rest once protection is on, across restarts', async () => {
    let core = makeCore()
    await core.start()
    const source = await makeTdata('one', 111n)
    const id = await core.accounts.importTdata(source.dir)
    const accountDir = core.accounts.dir(id)
    await core.accounts.update(id, { label: 'Рабочий', tags: ['work', ' work ', ''] })
    expect(core.store.get(id).tags).toEqual(['work'])

    await expect(core.enableProtection('12')).rejects.toThrow()
    await core.enableProtection('2468')
    expect(await exists(join(accountDir, 'tdata.sealed'))).toBe(true)
    expect(await exists(join(accountDir, 'tdata', 'key_datas'))).toBe(false)
    expect(await exists(join(dataDir, 'accounts.json'))).toBe(false)
    const db = await readFile(join(dataDir, 'accounts.enc'))
    expect(db.includes(Buffer.from('Рабочий'))).toBe(false)

    // Accounts added while protected are sealed right away.
    const other = await makeTdata('two', 222n)
    const otherId = await core.accounts.importTdata(other.dir)
    expect(await exists(join(core.accounts.dir(otherId), 'tdata', 'key_datas'))).toBe(false)

    await core.lock()
    expect(core.state()).toMatchObject({ vault: { enabled: true, locked: true }, accounts: [] })
    await expect(core.accounts.importTdata(source.dir)).rejects.toThrow(/locked/)

    core = makeCore()
    await core.start()
    expect(core.state().accounts).toEqual([])
    expect(await core.unlock('0000')).toBe(false)
    expect(await core.unlock('2468')).toBe(true)
    expect(core.state().accounts.map((account) => account.label || account.userId).sort()).toEqual(['222', 'Рабочий'])

    // Export yields a plain, readable tdata with the original key, and leaves the vault sealed.
    const exported = await core.accounts.exportTdata(id, join(root, 'export'))
    const info = await readTdata(exported)
    expect(info.accounts[0]!.authKey.equals(source.authKey)).toBe(true)
    expect(await exists(join(accountDir, 'tdata.sealed'))).toBe(true)

    await core.changePin('2468', 'longer passphrase')
    await expect(core.disableProtection('2468')).rejects.toThrow(/Wrong PIN/)
    await core.disableProtection('longer passphrase')
    expect(await exists(join(accountDir, 'tdata.sealed'))).toBe(false)
    expect((await readTdata(join(accountDir, 'tdata'))).accounts[0]!.userId).toBe(111n)
    expect(await exists(join(dataDir, 'vault.json'))).toBe(false)
    expect(await exists(join(dataDir, 'accounts.enc'))).toBe(false)

    core = makeCore()
    await core.start()
    expect(core.state().accounts).toHaveLength(2)
  })

  it('re-seals plaintext left behind by a crash as soon as the vault is unlocked', async () => {
    let core = makeCore()
    await core.start()
    const source = await makeTdata('one', 111n)
    const id = await core.accounts.importTdata(source.dir)
    await core.enableProtection('2468')
    const accountDir = core.accounts.dir(id)
    await core.lock()

    // Simulate "crashed while the client was running": plaintext on disk, no container.
    await rm(join(accountDir, 'tdata.sealed'))
    await writeTdata(join(accountDir, 'tdata'), { userId: 111n, dcId: 2, authKey: source.authKey })

    core = makeCore()
    await core.start()
    await core.unlock('2468')
    expect(await exists(join(accountDir, 'tdata.sealed'))).toBe(true)
    expect(await readdir(join(accountDir, 'tdata')).catch(() => [])).toEqual([])
  })

  it('removes an account together with its data', async () => {
    const core = makeCore()
    await core.start()
    const id = await core.accounts.importTdata((await makeTdata('one', 111n)).dir)
    await core.accounts.remove(id)
    expect(core.state().accounts).toEqual([])
    expect(await exists(core.accounts.dir(id))).toBe(false)
  })
})
