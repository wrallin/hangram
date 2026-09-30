/**
 * Interactive sign-in flows. Each flow owns one temporary MTProto client; once Telegram
 * authorizes it, the session is captured and the client is dropped *without* logging out,
 * so the same authorization continues to live inside Telegram Desktop.
 */
import { randomUUID } from 'node:crypto'
import { Api, type TelegramClient } from 'teleproto'
import { computeCheck } from 'teleproto/Password'
import { StringSession } from 'teleproto/sessions'
import type { CodeStepResult, LoginEvent, PhoneStartResult } from '@shared/types'
import { AppError } from '../core/errors'
import {
  type ApiCredentials,
  type AuthorizedSession,
  captureSession,
  closeClient,
  createClient,
  translateError
} from './client'
import { t } from '@shared/i18n'

const FLOW_TTL_MS = 15 * 60_000

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

interface Flow {
  id: string
  client: TelegramClient
  timer: NodeJS.Timeout
  abort: AbortController
  phone?: string
  phoneCodeHash?: string
  viaEmail?: boolean
  /** Resolver for the 2FA password requested by the QR flow. */
  passwordWaiter?: (password: string) => void
}

export interface LoginDeps {
  credentials: () => ApiCredentials
  appVersion: () => string
  /** Persists the authorized session as a new account; returns its id. */
  onAuthorized: (session: AuthorizedSession, source: 'phone' | 'qr' | 'session') => Promise<string>
  emit: (event: LoginEvent) => void
}

export class LoginService {
  private readonly flows = new Map<string, Flow>()

  constructor(private readonly deps: LoginDeps) {}

  private async open(session = new StringSession('')): Promise<Flow> {
    const client = createClient(session, this.deps.credentials(), this.deps.appVersion())
    const id = randomUUID()
    const flow: Flow = {
      id,
      client,
      abort: new AbortController(),
      timer: setTimeout(() => void this.cancel(id), FLOW_TTL_MS)
    }
    this.flows.set(id, flow)
    try {
      await client.connect()
    } catch (error) {
      await this.cancel(id)
      throw translateError(error)
    }
    return flow
  }

  private flow(id: string): Flow {
    const flow = this.flows.get(id)
    if (!flow) throw new AppError(t().errors.flowExpired, 'flow-expired')
    return flow
  }

  async cancel(id: string): Promise<void> {
    const flow = this.flows.get(id)
    if (!flow) return
    this.flows.delete(id)
    clearTimeout(flow.timer)
    flow.abort.abort()
    await closeClient(flow.client)
  }

  async cancelAll(): Promise<void> {
    await Promise.all([...this.flows.keys()].map((id) => this.cancel(id)))
  }

  private async finish(flow: Flow, source: 'phone' | 'qr' | 'session', user?: Api.TypeUser): Promise<string> {
    const session = await captureSession(flow.client, user)
    const accountId = await this.deps.onAuthorized(session, source)
    session.authKey.fill(0)
    await this.cancel(flow.id)
    return accountId
  }

  // ── phone number → code → (cloud password) ──────────────────────────────────

  private describeSentCode(sent: Api.auth.TypeSentCode, flow: Flow): Omit<PhoneStartResult, 'flowId'> {
    if (!(sent instanceof Api.auth.SentCode)) {
      throw new AppError(t().errors.unexpectedReply)
    }
    flow.phoneCodeHash = sent.phoneCodeHash
    const type = sent.type
    if (type instanceof Api.auth.SentCodeTypeSetUpEmailRequired) {
      throw new AppError(t().errors.emailRequired)
    }
    flow.viaEmail = type instanceof Api.auth.SentCodeTypeEmailCode
    const length = 'length' in type && typeof type.length === 'number' ? type.length : null
    if (type instanceof Api.auth.SentCodeTypeApp) return { via: 'app', length }
    if (type instanceof Api.auth.SentCodeTypeSms) return { via: 'sms', length }
    return { via: 'other', length }
  }

  async phoneStart(phone: string): Promise<PhoneStartResult> {
    const normalized = phone.replace(/[^\d+]/g, '')
    if (!/^\+?\d{6,15}$/.test(normalized)) throw new AppError(t().errors.badPhone)
    const flow = await this.open()
    try {
      flow.phone = normalized
      const { apiId, apiHash } = this.deps.credentials()
      const sent = await flow.client.invoke(
        new Api.auth.SendCode({ phoneNumber: normalized, apiId, apiHash, settings: new Api.CodeSettings({}) })
      )
      return { flowId: flow.id, ...this.describeSentCode(sent, flow) }
    } catch (error) {
      await this.cancel(flow.id)
      throw translateError(error)
    }
  }

  async resendCode(flowId: string): Promise<PhoneStartResult> {
    const flow = this.flow(flowId)
    try {
      const sent = await flow.client.invoke(
        new Api.auth.ResendCode({ phoneNumber: flow.phone!, phoneCodeHash: flow.phoneCodeHash! })
      )
      return { flowId, ...this.describeSentCode(sent, flow) }
    } catch (error) {
      throw translateError(error)
    }
  }

  async submitCode(flowId: string, code: string): Promise<CodeStepResult> {
    const flow = this.flow(flowId)
    if (!flow.phone || !flow.phoneCodeHash) throw new AppError(t().errors.requestCodeFirst)
    const phoneCode = code.replace(/\D/g, '')
    try {
      const result = await flow.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: flow.phone,
          phoneCodeHash: flow.phoneCodeHash,
          ...(flow.viaEmail
            ? { emailVerification: new Api.EmailVerificationCode({ code: phoneCode }) }
            : { phoneCode })
        })
      )
      if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        throw new AppError(t().errors.phoneUnoccupied)
      }
      return { status: 'done', accountId: await this.finish(flow, 'phone', result.user) }
    } catch (error) {
      if ((error as { errorMessage?: string }).errorMessage === 'SESSION_PASSWORD_NEEDED') {
        const password = await flow.client.invoke(new Api.account.GetPassword())
        return { status: 'password', hint: password.hint ?? '' }
      }
      throw translateError(error)
    }
  }

  async submitPassword(flowId: string, password: string): Promise<string | null> {
    const flow = this.flow(flowId)
    if (flow.passwordWaiter) {
      // QR flow: the library is waiting for the password; the result arrives as an event.
      const resolve = flow.passwordWaiter
      flow.passwordWaiter = undefined
      resolve(password)
      return null
    }
    try {
      const challenge = await flow.client.invoke(new Api.account.GetPassword())
      const result = await flow.client.invoke(
        new Api.auth.CheckPassword({ password: await computeCheck(challenge, password) })
      )
      if (!(result instanceof Api.auth.Authorization)) throw new AppError(t().errors.loginFailed)
      return await this.finish(flow, 'phone', result.user)
    } catch (error) {
      throw translateError(error)
    }
  }

  // ── QR code ─────────────────────────────────────────────────────────────────

  async qrStart(): Promise<string> {
    const flow = await this.open()
    const emit = (event: DistributiveOmit<LoginEvent, 'flowId'>): void =>
      this.deps.emit({ flowId: flow.id, ...event } as LoginEvent)

    void (async () => {
      try {
        const user = await flow.client.signInUserWithQrCode(this.deps.credentials(), {
          abortSignal: flow.abort.signal,
          qrCode: async ({ token, expires }) => {
            emit({ type: 'qr', url: `tg://login?token=${token.toString('base64url')}`, expiresAt: expires * 1000 })
          },
          password: (hint) =>
            new Promise<string>((resolve) => {
              flow.passwordWaiter = resolve
              emit({ type: 'password', hint: hint ?? '' })
            }),
          onError: async (error) => {
            if (flow.abort.signal.aborted) return true
            const translated = translateError(error)
            if (translated.code === 'PASSWORD_HASH_INVALID') {
              // Recoverable: report it and let the library ask for the password again.
              emit({ type: 'error', message: translated.message, fatal: false })
              return false
            }
            throw translated
          }
        })
        emit({ type: 'done', accountId: await this.finish(flow, 'qr', user) })
      } catch (error) {
        if (!flow.abort.signal.aborted) emit({ type: 'error', message: translateError(error).message, fatal: true })
        await this.cancel(flow.id)
      }
    })()
    return flow.id
  }

  // ── Telethon / GramJS string session ────────────────────────────────────────

  async importSession(value: string): Promise<string> {
    let session: StringSession
    try {
      session = new StringSession(value.trim())
      await session.load()
      if (!session.getAuthKey()?.getKey()) throw new Error('empty')
    } catch {
      throw new AppError(t().errors.badSession)
    }
    const flow = await this.open(session)
    try {
      return await this.finish(flow, 'session')
    } catch (error) {
      await this.cancel(flow.id)
      throw translateError(error)
    }
  }
}
