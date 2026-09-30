/**
 * Key management.
 *
 *   PIN ──scrypt──► KEK ──AES-GCM──► master key ──HKDF──► per-purpose subkeys
 *                                        ▲
 *   Touch ID ──Secure Enclave ECDH───────┘   (optional second wrapping of the same key)
 *
 * A vault holds one or more spaces: independent master keys, each wrapped with its own PIN.
 * The PIN that is entered decides which space opens, so two PINs lead to two unrelated
 * account lists. The first space is the main one; Touch ID always opens it.
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

interface Slot {
  id: string
  wrappedKey: string
}

interface VaultFile {
  version: 2
  /** Shared by every slot, so that a PIN attempt costs one scrypt run however many spaces exist. */
  kdf: KdfParams
  slots: Slot[]
  /** Second wrapping of the main space's key. */
  biometric: BiometricBlob | null
}

/** The format before spaces existed: a single PIN and a single key. */
interface VaultFileV1 {
  version: 1
  kdf: KdfParams
  wrappedKey: string
  biometric: BiometricBlob | null
}

interface OpenSpace {
  id: string
  master: Buffer
}

const WRAP_AAD = 'hangram:vault:master:v1'
export const MAIN_SPACE = 'main'

export class Vault {
  private file: VaultFile | null = null
  private current: OpenSpace | null = null
  private readonly path: string

  constructor(
    dir: string,
    private readonly biometric: Biometric
  ) {
    this.path = join(dir, 'vault.json')
  }

  async load(): Promise<void> {
    const file = await readJson<VaultFile | VaultFileV1>(this.path)
    if (file?.version === 2) this.file = file
    else if (file?.version === 1) {
      // Rewritten in the new format the next time anything changes.
      this.file = {
        version: 2,
        kdf: file.kdf,
        slots: [{ id: MAIN_SPACE, wrappedKey: file.wrappedKey }],
        biometric: file.biometric
      }
    } else this.file = null
  }

  get enabled(): boolean {
    return this.file !== null
  }

  get locked(): boolean {
    return this.enabled && this.current === null
  }

  get biometricEnabled(): boolean {
    return this.file?.biometric != null
  }

  /** Id of the unlocked space; the main one when protection is off or the vault is locked. */
  get spaceId(): string {
    return this.current?.id ?? MAIN_SPACE
  }

  get spaceCount(): number {
    return this.file?.slots.length ?? 0
  }

  /** Subkey for a given purpose, or null when protection is off. Throws when locked. */
  key(purpose: string): Buffer | null {
    if (!this.enabled) return null
    if (!this.current) throw new AppError(t().errors.vaultLocked, 'locked')
    return subkey(this.current.master, purpose)
  }

  /** Finds the space this PIN belongs to. */
  private async openWithPin(pin: string): Promise<OpenSpace | null> {
    if (!this.file) return null
    const kek = await deriveKey(pin, this.file.kdf)
    try {
      for (const slot of this.file.slots) {
        try {
          return { id: slot.id, master: open(kek, Buffer.from(slot.wrappedKey, 'base64'), WRAP_AAD) }
        } catch {
          // Not the PIN of this slot.
        }
      }
      return null
    } finally {
      kek.fill(0)
    }
  }

  /**
   * Wraps `master` under `pin`. Refuses a PIN that already opens a space: with two slots
   * answering to one PIN, the second would become unreachable.
   */
  private async wrapWithPin(pin: string, master: Buffer): Promise<string> {
    const taken = await this.openWithPin(pin)
    if (taken) {
      taken.master.fill(0)
      throw new AppError(t().errors.pinUnavailable, 'pin-unavailable')
    }
    const kek = await deriveKey(pin, this.file!.kdf)
    const wrappedKey = seal(kek, master, WRAP_AAD).toString('base64')
    kek.fill(0)
    return wrappedKey
  }

  private async persist(): Promise<void> {
    if (this.file) await writeFileAtomic(this.path, JSON.stringify(this.file, null, 2))
  }

  /** Turns protection on and leaves the vault unlocked in the main space. */
  async enable(pin: string): Promise<void> {
    if (this.enabled) throw new AppError(t().errors.protectionAlreadyOn)
    const master = randomBytes(KEY_BYTES)
    this.file = { version: 2, kdf: newKdfParams(), slots: [], biometric: null }
    this.file.slots.push({ id: MAIN_SPACE, wrappedKey: await this.wrapWithPin(pin, master) })
    this.current = { id: MAIN_SPACE, master }
    await this.persist()
  }

  /** Forgets the key material on disk. The caller must have decrypted everything first. */
  async disable(): Promise<void> {
    this.lock()
    this.file = null
    await fs.rm(this.path, { force: true })
  }

  /** True when `pin` is the PIN of the space that is open right now. */
  async verifyPin(pin: string): Promise<boolean> {
    const space = await this.openWithPin(pin)
    space?.master.fill(0)
    return space !== null && space.id === this.current?.id
  }

  async unlock(pin: string): Promise<boolean> {
    const space = await this.openWithPin(pin)
    if (!space) return false
    this.lock()
    this.current = space
    return true
  }

  /** Opens the main space. Resolves to false when the user dismisses the Touch ID prompt. */
  async unlockWithBiometric(): Promise<boolean> {
    if (!this.file?.biometric) throw new AppError(t().errors.touchIdNotConfigured)
    const master = await this.biometric.unwrap(this.file.biometric, t().touchIdReason)
    if (!master) return false
    if (master.length !== KEY_BYTES) throw new AppError(t().errors.touchIdBadKey)
    this.current = { id: MAIN_SPACE, master }
    return true
  }

  lock(): void {
    this.current?.master.fill(0)
    this.current = null
  }

  /** Changes the PIN of the open space. */
  async changePin(oldPin: string, newPin: string): Promise<void> {
    if (!this.file) throw new AppError(t().errors.protectionOff)
    const space = await this.openWithPin(oldPin)
    if (!space || (this.current && space.id !== this.current.id)) {
      space?.master.fill(0)
      throw new AppError(t().common.wrongPin, 'bad-pin')
    }
    try {
      const wrappedKey = await this.wrapWithPin(newPin, space.master)
      this.file.slots = this.file.slots.map((slot) => (slot.id === space.id ? { ...slot, wrappedKey } : slot))
    } finally {
      space.master.fill(0)
    }
    await this.persist()
  }

  /** Creates an empty space behind `pin`. The open space stays open. */
  async addSpace(pin: string): Promise<void> {
    if (!this.file || !this.current) throw new AppError(t().errors.vaultLocked, 'locked')
    const master = randomBytes(KEY_BYTES)
    try {
      const wrappedKey = await this.wrapWithPin(pin, master)
      this.file.slots.push({ id: randomBytes(8).toString('hex'), wrappedKey })
    } finally {
      master.fill(0)
    }
    await this.persist()
  }

  /** Destroys the key of the open space and locks. The main space cannot be removed this way. */
  async removeCurrentSpace(): Promise<void> {
    if (!this.file || !this.current) throw new AppError(t().errors.vaultLocked, 'locked')
    const id = this.current.id
    if (id === MAIN_SPACE) throw new AppError(t().errors.mainSpaceOnly)
    this.file.slots = this.file.slots.filter((slot) => slot.id !== id)
    this.lock()
    await this.persist()
  }

  async setBiometric(enabled: boolean): Promise<void> {
    if (!this.file || !this.current) throw new AppError(t().errors.vaultLocked, 'locked')
    if (this.current.id !== MAIN_SPACE) throw new AppError(t().errors.mainSpaceOnly)
    this.file.biometric = enabled ? await this.biometric.wrap(this.current.master) : null
    await this.persist()
  }
}
