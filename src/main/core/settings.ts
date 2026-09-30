import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { readJson, writeFileAtomic } from './fsx'

const DEFAULTS: Settings = {
  autoLockMinutes: 10,
  lockOnSleep: true,
  customTelegramPath: '',
  disableTelegramUpdates: false,
  language: 'system',
  apiId: '',
  apiHash: ''
}

/** Non-secret preferences; readable while the vault is locked. */
export class SettingsStore {
  private value: Settings = { ...DEFAULTS }
  private readonly path: string

  constructor(dir: string) {
    this.path = join(dir, 'settings.json')
  }

  async load(): Promise<void> {
    this.value = { ...DEFAULTS, ...((await readJson<Partial<Settings>>(this.path)) ?? {}) }
  }

  get current(): Settings {
    return this.value
  }

  async update(patch: Partial<Settings>): Promise<void> {
    this.value = { ...this.value, ...patch }
    await writeFileAtomic(this.path, JSON.stringify(this.value, null, 2))
  }
}
