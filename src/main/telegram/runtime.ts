/** Locates (and, when needed, installs) the Telegram Desktop build used to open accounts. */
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type { RuntimeState } from '@shared/types'
import { AppError } from '../core/errors'
import { exists, readJson } from '../core/fsx'
import type { SettingsStore } from '../core/settings'
import {
  type RuntimeManifest,
  type RuntimePlatform,
  TDESKTOP_BUNDLE_ID,
  fetchTelegram,
  readPlistValue,
  runtimeExecutable
} from './runtime-fetch'
import { t } from '@shared/i18n'

export interface ResolvedRuntime {
  executable: string
  version: string
  origin: 'managed' | 'custom'
}

const platform = process.platform as RuntimePlatform

export class Runtime {
  private current: RuntimeState = { status: 'missing' }
  private installing: Promise<void> | null = null
  private readonly managedDir: string

  constructor(
    dataDir: string,
    /** A build shipped inside the app package; copied out on first run so it can self-update. */
    private readonly bundledDir: string,
    private readonly settings: SettingsStore,
    private readonly onChange: () => void
  ) {
    this.managedDir = join(dataDir, 'runtime')
  }

  get state(): RuntimeState {
    return this.current
  }

  private set(state: RuntimeState): void {
    this.current = state
    this.onChange()
  }

  /** Validates a user-picked Telegram Desktop and returns its executable path. */
  static async inspectCustom(path: string): Promise<{ executable: string; version: string }> {
    if (platform === 'darwin') {
      const executable = join(path, 'Contents', 'MacOS', 'Telegram')
      const bundleId = await readPlistValue(path, 'CFBundleIdentifier')
      if (bundleId !== TDESKTOP_BUNDLE_ID || !(await exists(executable))) {
        throw new AppError(
          t().errors.notTelegramDesktop
        )
      }
      return {
        executable,
        version: (await readPlistValue(path, 'CFBundleShortVersionString')) ?? 'custom'
      }
    }
    const stat = await fs.stat(path).catch(() => null)
    if (!stat?.isFile() || !/^telegram(\.exe)?$/i.test(basename(path))) {
      throw new AppError(t().errors.chooseExecutable)
    }
    return { executable: path, version: 'custom' }
  }

  async resolve(): Promise<ResolvedRuntime | null> {
    const custom = this.settings.current.customTelegramPath
    if (custom) {
      try {
        return { ...(await Runtime.inspectCustom(custom)), origin: 'custom' }
      } catch {
        // The custom build disappeared; fall through to the managed one.
      }
    }
    const executable = runtimeExecutable(this.managedDir, platform)
    if (!(await exists(executable))) return null
    const version =
      (platform === 'darwin'
        ? // Telegram updates itself in place, so ask the bundle rather than our manifest.
          await readPlistValue(join(this.managedDir, 'Telegram.app'), 'CFBundleShortVersionString')
        : null) ??
      (await readJson<RuntimeManifest>(join(this.managedDir, 'runtime.json')))?.version ??
      'unknown'
    return { executable, version, origin: 'managed' }
  }

  /** Re-evaluates what is installed; seeds the managed copy from the bundled one if needed. */
  async refresh(): Promise<void> {
    if (this.installing) return
    let resolved = await this.resolve()
    if (!resolved && (await exists(runtimeExecutable(this.bundledDir, platform)))) {
      this.set({ status: 'installing' })
      await fs.rm(this.managedDir, { recursive: true, force: true })
      await fs.cp(this.bundledDir, this.managedDir, { recursive: true, verbatimSymlinks: true })
      resolved = await this.resolve()
    }
    this.set(
      resolved
        ? { status: 'ready', version: resolved.version, origin: resolved.origin }
        : { status: 'missing' }
    )
  }

  /** Downloads the latest official build. Concurrent calls share one download. */
  install(): Promise<void> {
    this.installing ??= (async () => {
      try {
        this.set({ status: 'downloading', received: 0, total: null })
        await fetchTelegram(platform, this.managedDir, (progress) =>
          this.set(
            progress.phase === 'download'
              ? { status: 'downloading', received: progress.received, total: progress.total }
              : { status: 'installing' }
          )
        )
        this.installing = null
        await this.refresh()
      } catch (error) {
        this.installing = null
        this.set({
          status: 'error',
          message: t().errors.downloadFailed(error instanceof Error ? error.message : String(error))
        })
      }
    })()
    return this.installing
  }
}
