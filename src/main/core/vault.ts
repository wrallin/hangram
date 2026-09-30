/**
 * Key management.
 *
 *   PIN ──scrypt──► KEK ──AES-GCM──► master key ──HKDF──► per-purpose subkeys
 *                                        ▲
 *   Touch ID ──Secure Enclave ECDH───────┘   (optional second wrapping of the same key)
 *
 * The master key exists in memory only while the vault is unlocked.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Biometric, BiometricBlob } from './biometric'
import {
  KEY_BYTES,
  type KdfParams,
  deriveKey,
  newKdfParams,
  open,
  randomBytes,
  seal,
  subkey
} from './crypto'
import { AppError } from './errors'
import { readJson, writeFileAtomic } from './fsx'
import { t } from '@shared/i18n'

interface VaultFile {
  version: 1
  kdf: KdfParams
  wrappedKey: string
  biometric: BiometricBlob | null
}

const WRAP_AAD = 'hangram:vault:master:v1'

export class Vault {
  private file: VaultFile | null = null
  private master: Buffer | null = null
  private readonly path: string

  constructor(
    dir: string,
    private readonly biometric: Biometric
  ) {
    this.path = join(dir, 'vault.json')
  }

  async load(): Promise<void> {
    const file = await readJson<VaultFile>(this.path)
    this.file = file?.version === 1 ? file : null
  }

  get enabled(): boolean {
    return this.file !== null
  }

  get locked(): boolean {
    return this.enabled && this.master === null
  }

  get biometricEnabled(): boolean {
    return this.file?.biometric != null
  }

  /** Subkey for a given purpose, or null when protection is off. Throws when locked. */
  key(purpose: string): Buffer | null {
    if (!this.enabled) return null
    if (!this.master) throw new AppError(t().errors.vaultLocked, 'locked')
    return subkey(this.master, purpose)
  }

  private async unwrapWithPin(pin: string): Promise<Buffer | null> {
    if (!this.file) return null
    const kek = await deriveKey(pin, this.file.kdf)
    try {
      return open(kek, Buffer.from(this.file.wrappedKey, 'base64'), WRAP_AAD)
    } catch {
      return null
    } finally {
      kek.fill(0)
    }
  }

  private async wrapWithPin(pin: string, master: Buffer): Promise<Pick<VaultFile, 'kdf' | 'wrappedKey'>> {
    const kdf = newKdfParams()
    const kek = await deriveKey(pin, kdf)
    const wrappedKey = seal(kek, master, WRAP_AAD).toString('base64')
    kek.fill(0)
    return { kdf, wrappedKey }
  }

  private async persist(): Promise<void> {
    if (this.file) await writeFileAtomic(this.path, JSON.stringify(this.file, null, 2))
  }

  /** Turns protection on and leaves the vault unlocked. */
  async enable(pin: string): Promise<void> {
    if (this.enabled) throw new AppError(t().errors.protectionAlreadyOn)
    const master = randomBytes(KEY_BYTES)
    this.file = { version: 1, ...(await this.wrapWithPin(pin, master)), biometric: null }
    this.master = master
    await this.persist()
  }

  /** Forgets the key material on disk. The caller must have decrypted everything first. */
  async disable(): Promise<void> {
    this.master?.fill(0)
    this.master = null
    this.file = null
    await fs.rm(this.path, { force: true })
  }

  async verifyPin(pin: string): Promise<boolean> {
    const master = await this.unwrapWithPin(pin)
    master?.fill(0)
    return master !== null
  }

  async unlock(pin: string): Promise<boolean> {
    const master = await this.unwrapWithPin(pin)
    if (!master) return false
    this.master = master
    return true
  }

  /** Resolves to false when the user dismisses the Touch ID prompt. */
  async unlockWithBiometric(): Promise<boolean> {
    if (!this.file?.biometric) throw new AppError(t().errors.touchIdNotConfigured)
    const master = await this.biometric.unwrap(this.file.biometric, t().touchIdReason)
    if (!master) return false
    if (master.length !== KEY_BYTES) throw new AppError(t().errors.touchIdBadKey)
    this.master = master
    return true
  }

  lock(): void {
    this.master?.fill(0)
    this.master = null
  }

  async changePin(oldPin: string, newPin: string): Promise<void> {
    if (!this.file) throw new AppError(t().errors.protectionOff)
    const master = await this.unwrapWithPin(oldPin)
    if (!master) throw new AppError(t().common.wrongPin, 'bad-pin')
    this.file = { ...this.file, ...(await this.wrapWithPin(newPin, master)) }
    master.fill(0)
    await this.persist()
  }

  async setBiometric(enabled: boolean): Promise<void> {
    if (!this.file || !this.master) throw new AppError(t().errors.vaultLocked, 'locked')
    this.file.biometric = enabled ? await this.biometric.wrap(this.master) : null
    await this.persist()
  }
}
