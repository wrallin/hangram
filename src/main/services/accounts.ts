/**
 * Account lifecycle: creation, import/export, launching, and keeping each account's
 * tdata sealed whenever protection is on and its client is not running.
 *
 * On-disk layout per account:  accounts/<id>/tdata/        (plaintext, only while in use)
 *                              accounts/<id>/tdata.sealed  (encrypted container)
 */
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type { Account, AccountPatch, AccountSource } from '@shared/types'
import { AppError } from '../core/errors'
import { SerialQueue, exists } from '../core/fsx'
import { isSealed, sealTdata, unsealTdata } from '../core/sealer'
import type { SettingsStore } from '../core/settings'
import type { AccountStore } from '../core/store'
import type { Vault } from '../core/vault'
import { type ApiCredentials, type AuthorizedSession, TDESKTOP_API, fetchProfile } from '../mtproto/client'
import { readTdata, writeTdata } from '../tdata/tdata'
import type { Launcher } from '../telegram/launcher'
import type { Runtime } from '../telegram/runtime'
import { t } from '@shared/i18n'

/** Not worth copying on import/export: caches, crash dumps, run markers. */
const TRANSIENT = [/^user_data/, /^dumps$/, /^temp$/, /^tdummy$/, /^working$/]

export interface AccountServiceDeps {
  dataDir: string
  vault: Vault
  store: AccountStore
  settings: SettingsStore
  launcher: Launcher
  runtime: Runtime
  onChange: () => void
}

export class AccountService {
  private readonly root: string
  private readonly busy = new Set<string>()
  private readonly queues = new Map<string, SerialQueue>()
  /** Set while locking/quitting: no network round-trips on client exit. */
  quiescing = false

  constructor(private readonly deps: AccountServiceDeps) {
    this.root = join(deps.dataDir, 'accounts')
    deps.launcher.on('exit', (id) => void this.handleClientExit(id))
  }

  // ── paths & small helpers ───────────────────────────────────────────────────

  dir = (id: string): string => join(this.root, id)
  private tdata = (id: string): string => join(this.root, id, 'tdata')
  private container = (id: string): string => join(this.root, id, 'tdata.sealed')
  private sealKey = (id: string): Buffer | null => this.deps.vault.key(`seal:${id}`)

  busyIds(): string[] {
    return [...this.busy]
  }

  credentials(): ApiCredentials {
    const { apiId, apiHash } = this.deps.settings.current
    const id = Number(apiId)
    return Number.isInteger(id) && id > 0 && apiHash ? { apiId: id, apiHash } : TDESKTOP_API
  }

  appVersion(): string {
    const runtime = this.deps.runtime.state
    return runtime.status === 'ready' && /^\d/.test(runtime.version) ? runtime.version : '5.10.3'
  }

  /** Serializes operations per account and exposes them to the UI as "busy". */
  private exclusive<T>(id: string, task: () => Promise<T>): Promise<T> {
    let queue = this.queues.get(id)
    if (!queue) this.queues.set(id, (queue = new SerialQueue()))
    return queue.run(async () => {
      this.busy.add(id)
      this.deps.onChange()
      try {
        return await task()
      } finally {
        this.busy.delete(id)
        this.deps.onChange()
      }
    })
  }

  private async persist(): Promise<void> {
    await this.deps.store.save(this.deps.vault.key('db'))
    this.deps.onChange()
  }

  // ── sealing ─────────────────────────────────────────────────────────────────

  private async seal(id: string): Promise<void> {
    const key = this.sealKey(id)
    if (!key || this.deps.launcher.isRunning(id)) return
    await sealTdata(this.tdata(id), this.container(id), key)
  }

  private async unseal(id: string): Promise<void> {
    const container = this.container(id)
    if (!(await isSealed(container))) return
    const key = this.sealKey(id)
    if (!key) throw new AppError(t().errors.sealedButUnprotected)
    // Whatever plaintext is lying around predates the container and is stale.
    await sealTdata(this.tdata(id), container, key)
    await unsealTdata(container, this.tdata(id), key)
  }

  /** Runs `task` with plaintext tdata available, restoring the sealed state afterwards. */
  private async withTdata<T>(id: string, task: (tdataDir: string) => Promise<T>): Promise<T> {
    if (this.deps.launcher.isRunning(id)) return task(this.tdata(id))
    await this.unseal(id)
    try {
      return await task(this.tdata(id))
    } finally {
      await this.seal(id)
    }
  }

  /** Seals every idle account. Used when locking and when protection is switched on. */
  async sealAll(): Promise<void> {
    for (const account of this.deps.store.list()) {
      await this.exclusive(account.id, () => this.seal(account.id))
    }
  }

  /** Decrypts every account in place. Used when protection is switched off. */
  async unsealAll(): Promise<void> {
    for (const account of this.deps.store.list()) {
      await this.exclusive(account.id, () => this.unseal(account.id))
    }
  }

  /** After unlock/startup: re-adopt surviving clients and re-seal anything left in the open. */
  async reconcile(): Promise<void> {
    for (const account of this.deps.store.list()) {
      await this.deps.launcher.adopt(account.id, this.dir(account.id))
    }
    await this.sealAll()
    this.deps.onChange()
  }

  // ── identity ────────────────────────────────────────────────────────────────

  /** Reads user id / DC straight from tdata (offline). */
  private async syncIdentityFromTdata(account: Account, tdataDir: string): Promise<boolean> {
    const info = await readTdata(tdataDir)
    const first = info.accounts[0]
    const next: Account = {
      ...account,
      passcodeProtected: info.status === 'passcode',
      innerAccounts: info.accounts.length,
      userId: first ? first.userId.toString() : info.status === 'passcode' ? account.userId : '',
      dcId: first ? first.dcId : info.status === 'passcode' ? account.dcId : 0
    }
    const changed = next.userId !== account.userId || next.innerAccounts !== account.innerAccounts ||
      next.passcodeProtected !== account.passcodeProtected || next.dcId !== account.dcId
    if (changed) this.deps.store.put(next)
    return changed
  }

  /** Asks Telegram for the current name, username, phone and photo of the account. */
  refreshProfile(id: string): Promise<void> {
    return this.exclusive(id, async () => {
      const account = this.deps.store.get(id)
      const info = await this.withTdata(id, (tdataDir) => readTdata(tdataDir))
      const first = info.accounts[0]
      if (info.status === 'passcode') {
        throw new AppError(t().errors.passcodeProtected)
      }
      if (!first) throw new AppError(t().errors.notLoggedIn)
      try {
        const { identity, avatar } = await fetchProfile(first.dcId, first.authKey, this.credentials(), this.appVersion())
        this.deps.store.put({
          ...account,
          ...identity,
          dcId: first.dcId,
          innerAccounts: info.accounts.length,
          passcodeProtected: false,
          avatarVersion: avatar ? Date.now() : 0
        })
        this.deps.store.setAvatar(id, avatar)
      } finally {
        first.authKey.fill(0)
      }
      await this.persist()
    })
  }

  // ── creation ────────────────────────────────────────────────────────────────

  private blank(source: AccountSource): Account {
    return {
      id: randomUUID(),
      label: '',
      firstName: '',
      lastName: '',
      username: '',
      phone: '',
      userId: '',
      dcId: 0,
      innerAccounts: 0,
      passcodeProtected: false,
      tags: [],
      note: '',
      pinned: false,
      source,
      createdAt: Date.now(),
      lastLaunchedAt: null,
      avatarVersion: 0
    }
  }

  private assertUnlocked(): void {
    if (!this.deps.store.loaded) throw new AppError(t().errors.vaultLocked, 'locked')
  }

  /** Persists a freshly authorized MTProto session as a Telegram Desktop profile. */
  async createFromSession(session: AuthorizedSession, source: AccountSource): Promise<string> {
    this.assertUnlocked()
    const duplicate = this.deps.store.list().find((item) => item.userId === session.identity.userId)
    if (duplicate) {
      throw new AppError(t().errors.alreadyAdded(duplicate.label || duplicate.firstName || duplicate.phone))
    }
    const account: Account = {
      ...this.blank(source),
      ...session.identity,
      dcId: session.dcId,
      innerAccounts: 1,
      avatarVersion: session.avatar ? Date.now() : 0
    }
    await this.exclusive(account.id, async () => {
      try {
        await writeTdata(this.tdata(account.id), {
          userId: BigInt(session.identity.userId),
          dcId: session.dcId,
          authKey: session.authKey
        })
        this.deps.store.put(account)
        this.deps.store.setAvatar(account.id, session.avatar)
        await this.seal(account.id)
        await this.persist()
      } catch (error) {
        this.deps.store.delete(account.id)
        await fs.rm(this.dir(account.id), { recursive: true, force: true })
        throw error
      }
    })
    return account.id
  }

  /** An empty profile: the user signs in inside Telegram Desktop itself. */
  async createEmpty(): Promise<string> {
    this.assertUnlocked()
    const account = this.blank('desktop')
    await fs.mkdir(this.dir(account.id), { recursive: true })
    this.deps.store.put(account)
    await this.persist()
    return account.id
  }

  /** Copies an existing tdata folder (or a folder containing one) into a new account. */
  async importTdata(sourcePath: string): Promise<string> {
    this.assertUnlocked()
    const candidates = [sourcePath, join(sourcePath, 'tdata')]
    let source: string | null = null
    for (const candidate of candidates) {
      if ((await exists(join(candidate, 'key_datas'))) || (await exists(join(candidate, 'key_data1')))) {
        source = candidate
        break
      }
    }
    if (!source) throw new AppError(t().errors.noTdata)
    if (source.startsWith(this.root)) throw new AppError(t().errors.ownFolder)

    const account = this.blank('tdata')
    const info = await readTdata(source)
    if (info.status === 'corrupt') throw new AppError(t().errors.tdataCorrupt)
    const userId = info.accounts[0]?.userId.toString() ?? ''
    if (userId && this.deps.store.list().some((item) => item.userId === userId)) {
      throw new AppError(t().errors.tdataDuplicate)
    }

    await this.exclusive(account.id, async () => {
      try {
        await fs.mkdir(this.dir(account.id), { recursive: true })
        await fs.cp(source, this.tdata(account.id), {
          recursive: true,
          filter: async (path) => {
            if (path === source) return true
            const stat = await fs.lstat(path)
            if (!stat.isFile() && !stat.isDirectory()) return false
            // Only top-level entries can be transient.
            return !(join(source, basename(path)) === path && TRANSIENT.some((re) => re.test(basename(path))))
          }
        })
        this.deps.store.put(account)
        await this.syncIdentityFromTdata(account, this.tdata(account.id))
        await this.seal(account.id)
        await this.persist()
      } catch (error) {
        this.deps.store.delete(account.id)
        await fs.rm(this.dir(account.id), { recursive: true, force: true })
        throw error
      }
    })
    return account.id
  }

  /** Writes a plain, portable copy of the account's tdata into `targetDir/tdata`. */
  exportTdata(id: string, targetDir: string): Promise<string> {
    return this.exclusive(id, async () => {
      const target = join(targetDir, 'tdata')
      if (await exists(target)) throw new AppError(t().errors.targetHasTdata)
      const container = this.container(id)
      if (await isSealed(container)) {
        await unsealTdata(container, target, this.sealKey(id)!, { keepContainer: true })
      } else {
        if (!(await exists(join(this.tdata(id), 'key_datas')))) throw new AppError(t().errors.profileEmpty)
        const source = this.tdata(id)
        await fs.cp(source, target, {
          recursive: true,
          filter: async (path) => {
            if (path === source) return true
            const stat = await fs.lstat(path)
            if (!stat.isFile() && !stat.isDirectory()) return false
            return !(join(source, basename(path)) === path && TRANSIENT.some((re) => re.test(basename(path))))
          }
        })
      }
      return target
    })
  }

  // ── editing & removal ───────────────────────────────────────────────────────

  async update(id: string, patch: AccountPatch): Promise<void> {
    const account = this.deps.store.get(id)
    const tags = patch.tags
      ? [...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 12)
      : account.tags
    this.deps.store.put({ ...account, ...patch, tags })
    await this.persist()
  }

  async remove(id: string): Promise<void> {
    this.deps.store.get(id)
    await this.deps.launcher.stop(id)
    await this.exclusive(id, async () => {
      await fs.rm(this.dir(id), { recursive: true, force: true })
      this.deps.store.delete(id)
      await this.persist()
    })
    this.queues.delete(id)
  }

  // ── running ─────────────────────────────────────────────────────────────────

  launch(id: string): Promise<void> {
    return this.exclusive(id, async () => {
      const account = this.deps.store.get(id)
      if (this.deps.launcher.isRunning(id)) return
      const runtime = await this.deps.runtime.resolve()
      if (!runtime) throw new AppError(t().errors.noRuntime, 'no-runtime')

      await fs.mkdir(this.dir(id), { recursive: true })
      await this.unseal(id)
      const args = this.deps.settings.current.disableTelegramUpdates ? ['-noupdate'] : []
      try {
        await this.deps.launcher.launch(id, this.dir(id), runtime.executable, args)
      } catch (error) {
        await this.seal(id)
        throw new AppError(t().errors.launchFailed((error as Error).message))
      }
      this.deps.store.put({ ...account, lastLaunchedAt: Date.now() })
      await this.persist()
    })
  }

  async stop(id: string): Promise<void> {
    await this.deps.launcher.stop(id)
  }

  /** The client quit: pick up what changed inside tdata and put it back under lock. */
  private async handleClientExit(id: string): Promise<void> {
    if (!this.deps.store.loaded || !this.deps.store.list().some((item) => item.id === id)) {
      this.deps.onChange()
      return
    }
    let needsProfile = false
    try {
      await this.exclusive(id, async () => {
        const account = this.deps.store.get(id)
        const changed = await this.syncIdentityFromTdata(account, this.tdata(id))
        const updated = this.deps.store.get(id)
        // A sign-in (or account switch) happened inside Telegram Desktop.
        needsProfile = !this.quiescing && changed && updated.userId !== '' && !updated.passcodeProtected
        if (changed && updated.userId !== account.userId) {
          this.deps.store.put({ ...updated, firstName: '', lastName: '', username: '', phone: '', avatarVersion: 0 })
          this.deps.store.setAvatar(id, null)
        }
        await this.seal(id)
        if (changed) await this.persist()
      })
      if (needsProfile) await this.refreshProfile(id)
    } catch {
      // Best effort: the account stays usable, the profile can be refreshed by hand.
    }
    this.deps.onChange()
  }
}
