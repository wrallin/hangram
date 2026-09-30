import { spawn } from 'node:child_process'
import { AppError } from './errors'
import { exists } from './fsx'
import { t } from '@shared/i18n'

export interface BiometricBlob {
  key: string
  eph: string
  box: string
}

type Reply = { ok: true; [key: string]: unknown } | { ok: false; error: string; cancelled?: boolean }

/**
 * Thin client for the Swift helper (see native/biometric/main.swift): Secure Enclave
 * key wrapping behind Touch ID, plus a polite "Quit" for a running app.
 */
export class Biometric {
  private available: boolean | null = null

  constructor(private readonly helperPath: string | null) {}

  private call(request: Record<string, unknown>): Promise<Reply> {
    return new Promise((resolve, reject) => {
      if (!this.helperPath) return reject(new Error('biometric helper is not available'))
      const child = spawn(this.helperPath, [], { stdio: ['pipe', 'pipe', 'ignore'] })
      const chunks: Buffer[] = []
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      child.on('error', reject)
      child.on('close', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Reply)
        } catch {
          reject(new Error('biometric helper returned garbage'))
        }
      })
      child.stdin.end(JSON.stringify(request))
    })
  }

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available
    this.available = false
    if (process.platform === 'darwin' && this.helperPath && (await exists(this.helperPath))) {
      try {
        const reply = await this.call({ op: 'available' })
        this.available = reply.ok && reply.available === true
      } catch {
        this.available = false
      }
    }
    return this.available
  }

  async wrap(secret: Buffer): Promise<BiometricBlob> {
    const reply = await this.call({ op: 'wrap', secret: secret.toString('base64') })
    if (!reply.ok) throw new AppError(t().errors.touchIdEnableFailed(reply.error))
    return { key: String(reply.key), eph: String(reply.eph), box: String(reply.box) }
  }

  /** Resolves to null when the user cancels the Touch ID prompt. */
  async unwrap(blob: BiometricBlob, reason: string): Promise<Buffer | null> {
    const reply = await this.call({ op: 'unwrap', ...blob, reason })
    if (!reply.ok) {
      if (reply.cancelled) return null
      throw new AppError(`Touch ID: ${reply.error}`, 'biometric')
    }
    return Buffer.from(String(reply.secret), 'base64')
  }

  /** Asks a macOS app to quit the way Cmd+Q does. False when the request could not be sent. */
  async quitApp(pid: number): Promise<boolean> {
    if (process.platform !== 'darwin' || !this.helperPath) return false
    try {
      const reply = await this.call({ op: 'quit', pid })
      return reply.ok && reply.sent === true
    } catch {
      return false
    }
  }
}
