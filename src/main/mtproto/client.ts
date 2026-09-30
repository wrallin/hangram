/** Short-lived MTProto connections: signing in and reading the profile of an account. */
import { execFileSync } from 'node:child_process'
import { release } from 'node:os'
import { Api, TelegramClient } from 'teleproto'
import { PROD_DC_IPV4 } from 'teleproto/client/telegramBaseClient'
import { LogLevel, Logger } from 'teleproto/extensions/Logger'
import { StringSession } from 'teleproto/sessions'
import { AppError } from '../core/errors'
import { t } from '@shared/i18n'

export interface ApiCredentials {
  apiId: number
  apiHash: string
}

/**
 * Telegram Desktop's own credentials (public in its source tree). Sessions created here are
 * handed to Telegram Desktop, so they must be issued for the app that will use them.
 */
export const TDESKTOP_API: ApiCredentials = { apiId: 2040, apiHash: 'b18441a1ff607e10a989891a5462e627' }

export interface Identity {
  userId: string
  firstName: string
  lastName: string
  username: string
  phone: string
}

export interface AuthorizedSession {
  identity: Identity
  avatar: Buffer | null
  dcId: number
  authKey: Buffer
}

let cachedDevice: { deviceModel: string; systemVersion: string } | null = null

/** Mirrors what Telegram Desktop reports, so the session looks the same before and after hand-over. */
function deviceInfo(): { deviceModel: string; systemVersion: string } {
  if (cachedDevice) return cachedDevice
  if (process.platform === 'darwin') {
    let model = 'Mac'
    let version = ''
    try {
      model = execFileSync('/usr/sbin/sysctl', ['-n', 'hw.model'], { encoding: 'utf8' }).trim() || model
      version = execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim()
    } catch {
      /* keep the defaults */
    }
    cachedDevice = { deviceModel: model, systemVersion: `macOS ${version.split('.').slice(0, 2).join('.')}`.trim() }
  } else if (process.platform === 'win32') {
    const build = Number(release().split('.')[2] ?? 0)
    cachedDevice = { deviceModel: 'Desktop', systemVersion: build >= 22000 ? 'Windows 11' : 'Windows 10' }
  } else {
    cachedDevice = { deviceModel: 'Desktop', systemVersion: 'Linux' }
  }
  return cachedDevice
}

export function createClient(session: StringSession, credentials: ApiCredentials, appVersion: string): TelegramClient {
  return new TelegramClient(session, credentials.apiId, credentials.apiHash, {
    ...deviceInfo(),
    appVersion: `${appVersion} ${process.arch === 'arm64' ? 'arm64' : 'x64'}`,
    langCode: 'en',
    systemLangCode: 'en-US',
    connectionRetries: 3,
    autoReconnect: false,
    baseLogger: new Logger(LogLevel.NONE)
  })
}

/** A session for an auth key we already hold (from tdata). */
export function sessionFromKey(dcId: number, authKey: Buffer): StringSession {
  const address = PROD_DC_IPV4[dcId]
  if (!address) throw new AppError(t().errors.unknownDc(dcId))
  const session = new StringSession('')
  session.setDC(dcId, address, 443)
  session._key = authKey
  return session
}

export function toIdentity(user: Api.TypeUser): Identity {
  if (!(user instanceof Api.User)) throw new AppError(t().errors.emptyProfile)
  return {
    userId: user.id.toString(),
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    username: user.username ?? user.usernames?.find((item) => item.active)?.username ?? '',
    phone: user.phone ? `+${user.phone}` : ''
  }
}

async function downloadAvatar(client: TelegramClient): Promise<Buffer | null> {
  try {
    const photo = await client.downloadProfilePhoto('me', { isBig: false })
    return Buffer.isBuffer(photo) && photo.length > 0 ? photo : null
  } catch {
    return null
  }
}

/** Collects everything needed to hand an authorized client over to Telegram Desktop. */
export async function captureSession(client: TelegramClient, user?: Api.TypeUser): Promise<AuthorizedSession> {
  const identity = toIdentity(user ?? (await client.getMe()))
  const avatar = await downloadAvatar(client)
  const dcId = client.session.dcId
  const authKey = client.session.getAuthKey(dcId)?.getKey()
  if (!authKey || authKey.length !== 256) throw new AppError(t().errors.noAuthKey)
  return { identity, avatar, dcId, authKey: Buffer.from(authKey) }
}

export async function closeClient(client: TelegramClient): Promise<void> {
  try {
    await client.destroy()
  } catch {
    /* the connection may already be gone */
  }
}

/** Connects with an existing key just long enough to read the profile. */
export async function fetchProfile(
  dcId: number,
  authKey: Buffer,
  credentials: ApiCredentials,
  appVersion: string
): Promise<{ identity: Identity; avatar: Buffer | null }> {
  const client = createClient(sessionFromKey(dcId, authKey), credentials, appVersion)
  try {
    await client.connect()
    const identity = toIdentity(await client.getMe())
    return { identity, avatar: await downloadAvatar(client) }
  } catch (error) {
    throw translateError(error)
  } finally {
    await closeClient(client)
  }
}

/** Turns library/RPC errors into something a person can act on. */
export function translateError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const raw = error as { errorMessage?: string; seconds?: number; message?: string }
  if (typeof raw?.seconds === 'number' && raw.seconds > 0) {
    return new AppError(t().errors.floodWait(raw.seconds), 'flood')
  }
  const code = raw?.errorMessage ?? ''
  const known = t().telegramErrors[code]
  if (known) return new AppError(known, code)
  if (code) return new AppError(t().errors.telegram(code), code)
  const message = raw?.message ?? String(error)
  if (/timeout|ECONN|ENOTFOUND|EAI_AGAIN|disconnect|network/i.test(message)) {
    return new AppError(t().errors.network, 'network')
  }
  return new AppError(message)
}
