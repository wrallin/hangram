/**
 * Account metadata and avatars. One file: `accounts.enc` (AES-256-GCM under the vault's
 * "db" subkey) when protection is on, `accounts.json` otherwise. Every additional space
 * of the vault has a file of its own, `accounts.<space id>.enc`. While the vault is
 * locked nothing is held in memory.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Account } from '@shared/types'
import { open, seal } from './crypto'
import { AppError } from './errors'
import { SerialQueue, readFileIfExists, writeFileAtomic } from './fsx'
import { t } from '@shared/i18n'
import { MAIN_SPACE } from './vault'

interface StoreData {
  version: 1
  accounts: Account[]
  /** Account id → base64 JPEG. */
  avatars: Record<string, string>
}

const AAD = 'hangram:accounts:v1'
const empty = (): StoreData => ({ version: 1, accounts: [], avatars: {} })

export class AccountStore {
  private data: StoreData | null = null
  private readonly queue = new SerialQueue()
  private readonly plainPath: string
  private sealedPath: string

  constructor(private readonly dir: string) {
    this.plainPath = join(dir, 'accounts.json')
    this.sealedPath = join(dir, 'accounts.enc')
  }

  get loaded(): boolean {
    return this.data !== null
  }

  private get state(): StoreData {
    if (!this.data) throw new AppError(t().errors.vaultLocked, 'locked')
    return this.data
  }

  /** `key` is null when protection is off. `space` selects which list of the vault to open. */
  async load(key: Buffer | null, space: string = MAIN_SPACE): Promise<void> {
    const main = space === MAIN_SPACE
    this.sealedPath = join(this.dir, main ? 'accounts.enc' : `accounts.${space}.enc`)
    const sealed = key ? await readFileIfExists(this.sealedPath) : null
    if (key && !main) {
      // The plaintext file belongs to the main space only.
      this.data = sealed ? (JSON.parse(open(key, sealed, AAD).toString('utf8')) as StoreData) : empty()
      return
    }
    if (key && sealed) {
      this.data = JSON.parse(open(key, sealed, AAD).toString('utf8')) as StoreData
      // A plaintext copy can only be a leftover of an interrupted mode switch.
      await fs.rm(this.plainPath, { force: true })
      return
    }
    const plain = await readFileIfExists(this.plainPath)
    this.data = plain ? (JSON.parse(plain.toString('utf8')) as StoreData) : empty()
    if (key) await this.save(key)
  }

  unload(): void {
    this.data = null
  }

  /** Deletes the file of the loaded space and forgets its contents. */
  async destroy(): Promise<void> {
    await this.queue.run(() => fs.rm(this.sealedPath, { force: true }))
    this.data = null
  }

  /** Persists in the mode matching `key` and removes the file of the other mode. */
  save(key: Buffer | null): Promise<void> {
    const json = Buffer.from(JSON.stringify(this.state), 'utf8')
    return this.queue.run(async () => {
      if (key) {
        await writeFileAtomic(this.sealedPath, seal(key, json, AAD))
        await fs.rm(this.plainPath, { force: true })
      } else {
        await writeFileAtomic(this.plainPath, json)
        await fs.rm(this.sealedPath, { force: true })
      }
    })
  }

  /** Writes the plaintext file without touching the sealed one (first half of "disable"). */
  savePlainCopy(): Promise<void> {
    const json = Buffer.from(JSON.stringify(this.state), 'utf8')
    return this.queue.run(() => writeFileAtomic(this.plainPath, json))
  }

  list(): Account[] {
    return this.data ? this.data.accounts : []
  }

  get(id: string): Account {
    const account = this.state.accounts.find((item) => item.id === id)
    if (!account) throw new AppError(t().errors.accountNotFound, 'not-found')
    return account
  }

  put(account: Account): void {
    const accounts = this.state.accounts
    const index = accounts.findIndex((item) => item.id === account.id)
    if (index >= 0) accounts[index] = account
    else accounts.push(account)
  }

  delete(id: string): void {
    this.state.accounts = this.state.accounts.filter((item) => item.id !== id)
    delete this.state.avatars[id]
  }

  avatar(id: string): Buffer | null {
    const encoded = this.data?.avatars[id]
    return encoded ? Buffer.from(encoded, 'base64') : null
  }

  setAvatar(id: string, image: Buffer | null): void {
    if (image && image.length > 0) this.state.avatars[id] = image.toString('base64')
    else delete this.state.avatars[id]
  }
}
