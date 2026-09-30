/** The one and only contract between the renderer and the main process. */
import type {
  AccountPatch,
  AppState,
  CodeStepResult,
  LoginEvent,
  PhoneStartResult,
  Settings
} from './types'

export interface IpcCalls {
  'state:get': () => AppState

  'vault:enable': (pin: string) => void
  'vault:disable': (pin: string) => void
  'vault:unlock': (pin: string) => boolean
  'vault:unlock-biometric': () => boolean
  'vault:lock': () => void
  'vault:change-pin': (oldPin: string, newPin: string) => void
  'vault:set-biometric': (enabled: boolean) => void
  'vault:add-space': (pin: string) => void
  'vault:remove-space': (pin: string) => void

  'settings:update': (patch: Partial<Settings>) => void

  'runtime:install': () => void
  'runtime:choose-custom': () => void
  'runtime:reset-custom': () => void

  'accounts:launch': (id: string) => void
  'accounts:stop': (id: string) => void
  'accounts:update': (id: string, patch: AccountPatch) => void
  'accounts:remove': (id: string) => boolean
  'accounts:refresh': (id: string) => void
  'accounts:reveal': (id: string) => void
  'accounts:export': (id: string) => void
  'accounts:menu': (id: string) => void
  'accounts:import-tdata': () => string | null
  'accounts:create-empty': () => string

  'login:phone-start': (phone: string) => PhoneStartResult
  'login:resend-code': (flowId: string) => PhoneStartResult
  'login:submit-code': (flowId: string, code: string) => CodeStepResult
  /** Resolves to the new account id, or null when the result arrives as a LoginEvent (QR flow). */
  'login:submit-password': (flowId: string, password: string) => string | null
  'login:qr-start': () => string
  'login:import-session': (session: string) => string
  'login:cancel': (flowId: string) => void
}

export type UiCommand =
  | { type: 'add-account' }
  | { type: 'settings' }
  | { type: 'find' }
  | { type: 'edit-account'; id: string }

export interface IpcEvents {
  state: AppState
  login: LoginEvent
  command: UiCommand
}

export type IpcChannel = keyof IpcCalls
export type IpcArgs<C extends IpcChannel> = Parameters<IpcCalls[C]>
export type IpcResult<C extends IpcChannel> = ReturnType<IpcCalls[C]>

/** Wire format: errors travel as data so their messages survive the IPC boundary intact. */
export type IpcEnvelope<T> = { ok: true; value: T } | { ok: false; error: string; code: string }

export interface Bridge {
  invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>>
  on<E extends keyof IpcEvents>(event: E, listener: (payload: IpcEvents[E]) => void): () => void
}
