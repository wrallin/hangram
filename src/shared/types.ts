/** Domain types shared by the main process and the renderer. */
import type { Lang, LanguagePreference } from './i18n'

export type Platform = 'darwin' | 'win32' | 'linux'

export type AccountSource = 'phone' | 'qr' | 'session' | 'tdata' | 'desktop'

export interface Account {
  id: string
  /** User-chosen display name; falls back to the Telegram name. */
  label: string
  firstName: string
  lastName: string
  username: string
  phone: string
  /** Telegram user id as a decimal string (ids exceed 2^53 in theory). */
  userId: string
  dcId: number
  /** Number of Telegram accounts inside this tdata (Telegram Desktop allows several). */
  innerAccounts: number
  /** tdata is protected by a Telegram local passcode we do not know. */
  passcodeProtected: boolean
  tags: string[]
  note: string
  pinned: boolean
  source: AccountSource
  createdAt: number
  lastLaunchedAt: number | null
  /** Bumped whenever the avatar changes; 0 means "no avatar". */
  avatarVersion: number
}

export type AccountPatch = Partial<Pick<Account, 'label' | 'tags' | 'note' | 'pinned'>>

export interface VaultState {
  enabled: boolean
  locked: boolean
  biometricAvailable: boolean
  biometricEnabled: boolean
}

export interface Settings {
  /** 0 disables idle auto-lock. */
  autoLockMinutes: number
  lockOnSleep: boolean
  /** Path to a user-supplied Telegram Desktop build; empty = managed runtime. */
  customTelegramPath: string
  disableTelegramUpdates: boolean
  /** 'system' follows the OS locale. */
  language: LanguagePreference
  /** Empty values mean "use Telegram Desktop's own API credentials". */
  apiId: string
  apiHash: string
}

export type RuntimeState =
  | { status: 'missing' }
  | { status: 'downloading'; received: number; total: number | null }
  | { status: 'installing' }
  | { status: 'ready'; version: string; origin: 'managed' | 'custom' }
  | { status: 'error'; message: string }

export interface AppState {
  platform: Platform
  version: string
  /** Language in effect, with 'system' already resolved. */
  lang: Lang
  /** System accent colour as #rrggbb, when the OS exposes one. */
  accent: string | null
  vault: VaultState
  settings: Settings
  runtime: RuntimeState
  /** Empty while the vault is locked. */
  accounts: Account[]
  /** Ids of accounts whose Telegram client is currently running. */
  running: string[]
  /** Ids with a long operation in flight (sealing, importing, refreshing…). */
  busy: string[]
}

export type LoginEvent =
  | { flowId: string; type: 'qr'; url: string; expiresAt: number }
  | { flowId: string; type: 'password'; hint: string }
  | { flowId: string; type: 'done'; accountId: string }
  | { flowId: string; type: 'error'; message: string; fatal: boolean }

export type CodeStepResult =
  | { status: 'done'; accountId: string }
  | { status: 'password'; hint: string }

export interface PhoneStartResult {
  flowId: string
  /** Where Telegram sent the code. */
  via: 'app' | 'sms' | 'other'
  length: number | null
}

export type AccountMenuAction =
  | 'launch'
  | 'stop'
  | 'edit'
  | 'pin'
  | 'refresh'
  | 'reveal'
  | 'export'
  | 'remove'
