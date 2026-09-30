/** Composition root of the main process: wires services together and owns lock/unlock. */
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import type { AppState, LoginEvent, Platform } from '@shared/types'
import { Biometric } from './core/biometric'
import { AppError } from './core/errors'
import { SerialQueue } from './core/fsx'
import { SettingsStore } from './core/settings'
import { AccountStore } from './core/store'
import { MAIN_SPACE, Vault } from './core/vault'
import { LoginService } from './mtproto/login'
import { AccountService } from './services/accounts'
import { Launcher } from './telegram/launcher'
import { Runtime } from './telegram/runtime'
import { language, resolveLanguage, setLanguage, t } from '@shared/i18n'

export interface CoreOptions {
  dataDir: string
  resourcesDir: string
  version: string
  /** System locale (BCP 47), used when the language setting is "system". */
  locale: () => string
  accent: () => string | null
  onState: (state: AppState) => void
  onLogin: (event: LoginEvent) => void
}

const MIN_PIN_LENGTH = 4

export class Core {
  readonly settings: SettingsStore
  readonly vault: Vault
  readonly store: AccountStore
  readonly launcher: Launcher
  readonly runtime: Runtime
  readonly accounts: AccountService
  readonly login: LoginService

  private readonly biometric: Biometric
  private biometricAvailable = false
  /** Lock, unlock and mode switches must never interleave. */
  private readonly transitions = new SerialQueue()
  private notifyScheduled = false

  constructor(private readonly options: CoreOptions) {
    const { dataDir, resourcesDir } = options
    const helper = process.platform === 'darwin' ? join(resourcesDir, 'bin', 'hangram-biometric') : null
    this.biometric = new Biometric(helper)
    this.settings = new SettingsStore(dataDir)
    this.vault = new Vault(dataDir, this.biometric)
    this.store = new AccountStore(dataDir)
    this.launcher = new Launcher(this.biometric)
    this.runtime = new Runtime(dataDir, join(resourcesDir, 'telegram'), this.settings, this.notify)
    this.accounts = new AccountService({
      dataDir,
      vault: this.vault,
      store: this.store,
      settings: this.settings,
      launcher: this.launcher,
      runtime: this.runtime,
      onChange: this.notify
    })
    this.login = new LoginService({
      credentials: () => this.accounts.credentials(),
      appVersion: () => this.accounts.appVersion(),
      onAuthorized: (session, source) => this.accounts.createFromSession(session, source),
      emit: options.onLogin
    })
  }

  async start(): Promise<void> {
    await fs.mkdir(this.options.dataDir, { recursive: true, mode: 0o700 })
    await Promise.all([this.settings.load(), this.vault.load()])
    this.applyLanguage()
    this.biometricAvailable = await this.biometric.isAvailable()
    if (!this.vault.enabled) {
      await this.store.load(null)
      await this.accounts.reconcile()
    }
    await this.runtime.refresh()
    this.notify()
  }

  /** Makes the language chosen in the settings the one every message is produced in. */
  applyLanguage(): void {
    setLanguage(resolveLanguage(this.settings.current.language, this.options.locale()))
  }

  /** Coalesces bursts of changes into one state push per tick. */
  readonly notify = (): void => {
    if (this.notifyScheduled) return
    this.notifyScheduled = true
    setImmediate(() => {
      this.notifyScheduled = false
      this.options.onState(this.state())
    })
  }

  state(): AppState {
    return {
      platform: process.platform as Platform,
      version: this.options.version,
      lang: language(),
      accent: this.options.accent(),
      vault: {
        enabled: this.vault.enabled,
        locked: this.vault.locked,
        biometricAvailable: this.biometricAvailable,
        biometricEnabled: this.vault.biometricEnabled,
        hiddenSpace: this.vault.spaceId !== MAIN_SPACE
      },
      settings: this.settings.current,
      runtime: this.runtime.state,
      accounts: this.vault.locked ? [] : this.store.list(),
      running: this.launcher.runningIds(),
      busy: this.accounts.busyIds()
    }
  }

  private static checkPin(pin: string): void {
    if (pin.length < MIN_PIN_LENGTH) throw new AppError(t().errors.pinTooShort(MIN_PIN_LENGTH))
  }

  private async afterUnlock(): Promise<void> {
    await this.store.load(this.vault.key('db'), this.vault.spaceId)
    await this.accounts.reconcile()
    this.notify()
  }

  unlock(pin: string): Promise<boolean> {
    return this.transitions.run(async () => {
      if (!this.vault.locked) return true
      if (!(await this.vault.unlock(pin))) return false
      await this.afterUnlock()
      return true
    })
  }

  unlockWithBiometric(): Promise<boolean> {
    return this.transitions.run(async () => {
      if (!this.vault.locked) return true
      if (!(await this.vault.unlockWithBiometric())) return false
      await this.afterUnlock()
      return true
    })
  }

  /**
   * Closes every Telegram client, seals every tdata, and forgets the key.
   * A no-op when protection is off or the vault is already locked.
   */
  lock(): Promise<void> {
    return this.transitions.run(async () => {
      if (!this.vault.enabled || this.vault.locked) return
      this.accounts.quiescing = true
      try {
        await this.login.cancelAll()
        await this.launcher.stopAll()
        await this.accounts.sealAll()
      } finally {
        this.accounts.quiescing = false
      }
      this.store.unload()
      this.vault.lock()
      this.notify()
    })
  }

  enableProtection(pin: string): Promise<void> {
    return this.transitions.run(async () => {
      Core.checkPin(pin)
      await this.vault.enable(pin)
      await this.store.save(this.vault.key('db'))
      await this.accounts.sealAll()
      this.notify()
    })
  }

  disableProtection(pin: string): Promise<void> {
    return this.transitions.run(async () => {
      if (this.vault.locked) throw new AppError(t().errors.vaultLocked, 'locked')
      if (!(await this.vault.verifyPin(pin))) throw new AppError(t().common.wrongPin, 'bad-pin')
      if (this.vault.spaceId !== MAIN_SPACE) throw new AppError(t().errors.mainSpaceOnly)
      // Other spaces cannot be decrypted without their PINs, and dropping the vault would orphan them.
      if (this.vault.spaceCount > 1) throw new AppError(t().errors.otherSpacesExist)
      // Order matters for crash safety: plaintext first, key material last.
      await this.accounts.unsealAll()
      await this.store.savePlainCopy()
      await this.vault.disable()
      await this.store.save(null)
      this.notify()
    })
  }

  changePin(oldPin: string, newPin: string): Promise<void> {
    return this.transitions.run(async () => {
      Core.checkPin(newPin)
      await this.vault.changePin(oldPin, newPin)
    })
  }

  /** Adds an empty account list behind another PIN. Nothing visible changes until that PIN is entered. */
  addSpace(pin: string): Promise<void> {
    return this.transitions.run(async () => {
      Core.checkPin(pin)
      await this.vault.addSpace(pin)
    })
  }

  /** Deletes the open (non-main) space together with its accounts, then locks. */
  removeSpace(pin: string): Promise<void> {
    return this.transitions.run(async () => {
      if (this.vault.locked) throw new AppError(t().errors.vaultLocked, 'locked')
      if (this.vault.spaceId === MAIN_SPACE) throw new AppError(t().errors.mainSpaceOnly)
      if (!(await this.vault.verifyPin(pin))) throw new AppError(t().common.wrongPin, 'bad-pin')
      this.accounts.quiescing = true
      try {
        await this.login.cancelAll()
        await this.launcher.stopAll()
        for (const account of [...this.store.list()]) await this.accounts.remove(account.id)
      } finally {
        this.accounts.quiescing = false
      }
      await this.store.destroy()
      await this.vault.removeCurrentSpace()
      this.notify()
    })
  }

  setBiometric(enabled: boolean): Promise<void> {
    return this.transitions.run(async () => {
      await this.vault.setBiometric(enabled)
      this.notify()
    })
  }

  /** True when quitting right now would leave decrypted tdata behind. */
  get needsSealBeforeQuit(): boolean {
    return this.vault.enabled && !this.vault.locked
  }
}
