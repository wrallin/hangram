/**
 * Downloads and unpacks an official Telegram Desktop build.
 * Pure Node (no Electron imports) so the packaging script can reuse it.
 */
import { execFile } from 'node:child_process'
import { createWriteStream, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type RuntimePlatform = 'darwin' | 'win32' | 'linux'

/** Apple Developer Team of Telegram FZ-LLC, the publisher of Telegram Desktop. */
const TELEGRAM_TEAM_ID = 'C67CF9S4VU'
export const TDESKTOP_BUNDLE_ID = 'com.tdesktop.Telegram'

const SOURCES: Record<RuntimePlatform, string> = {
  darwin: 'https://telegram.org/dl/desktop/mac',
  win32: 'https://telegram.org/dl/desktop/win64_portable',
  linux: 'https://telegram.org/dl/desktop/linux'
}

const ALLOWED_HOSTS = /(^|\.)telegram\.org$/

export interface RuntimeManifest {
  version: string
  installedAt: number
}

export type FetchProgress =
  | { phase: 'download'; received: number; total: number | null }
  | { phase: 'install' }

/** Executable path inside a runtime directory. */
export function runtimeExecutable(dir: string, platform: RuntimePlatform): string {
  switch (platform) {
    case 'darwin':
      return join(dir, 'Telegram.app', 'Contents', 'MacOS', 'Telegram')
    case 'win32':
      return join(dir, 'Telegram', 'Telegram.exe')
    case 'linux':
      return join(dir, 'Telegram', 'Telegram')
  }
}

export async function readPlistValue(appPath: string, key: string): Promise<string | null> {
  try {
    const { stdout } = await run('/usr/bin/plutil', [
      '-extract',
      key,
      'raw',
      join(appPath, 'Contents', 'Info.plist')
    ])
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function verifyMacSignature(appPath: string): Promise<void> {
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath])
  // codesign prints the details to stderr.
  const { stderr } = await run('/usr/bin/codesign', ['-dv', '--verbose=2', appPath])
  const team = /^TeamIdentifier=(.+)$/m.exec(stderr)?.[1] ?? 'none'
  if (team !== TELEGRAM_TEAM_ID) {
    const authority = /^Authority=(.+)$/m.exec(stderr)?.[1] ?? 'unknown'
    throw new Error(`downloaded Telegram.app is signed by an unexpected team: ${team} (${authority})`)
  }
}

async function download(
  url: string,
  target: string,
  onProgress: (progress: FetchProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(url, { redirect: 'follow', signal })
  if (!response.ok || !response.body) throw new Error(`download failed: HTTP ${response.status}`)
  const finalUrl = new URL(response.url)
  if (finalUrl.protocol !== 'https:' || !ALLOWED_HOSTS.test(finalUrl.hostname)) {
    throw new Error(`unexpected download host: ${finalUrl.hostname}`)
  }
  const total = Number(response.headers.get('content-length')) || null
  let received = 0
  let lastReport = 0
  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>)
  body.on('data', (chunk: Buffer) => {
    received += chunk.length
    const now = Date.now()
    if (now - lastReport > 200) {
      lastReport = now
      onProgress({ phase: 'download', received, total })
    }
  })
  await pipeline(body, createWriteStream(target))
  onProgress({ phase: 'download', received, total })
  return finalUrl.pathname
}

async function unpackMac(archive: string, destination: string, scratch: string): Promise<void> {
  const mount = join(scratch, 'mount')
  await fs.mkdir(mount)
  await run('/usr/bin/hdiutil', ['attach', archive, '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount])
  try {
    await run('/usr/bin/ditto', [join(mount, 'Telegram.app'), join(destination, 'Telegram.app')])
  } finally {
    await run('/usr/bin/hdiutil', ['detach', mount, '-force']).catch(() => undefined)
  }
  await verifyMacSignature(join(destination, 'Telegram.app'))
}

/**
 * Installs the latest official build into `destination` (replacing what is there).
 * The new build is fully unpacked and verified next to the destination before the swap.
 */
export async function fetchTelegram(
  platform: RuntimePlatform,
  destination: string,
  onProgress: (progress: FetchProgress) => void = () => undefined,
  signal?: AbortSignal
): Promise<RuntimeManifest> {
  const scratch = `${destination}.tmp-${process.pid}`
  const staged = join(scratch, 'staged')
  await fs.rm(scratch, { recursive: true, force: true })
  await fs.mkdir(staged, { recursive: true })
  try {
    const archive = join(scratch, 'archive')
    const remoteName = await download(SOURCES[platform], archive, onProgress, signal)
    onProgress({ phase: 'install' })

    if (platform === 'darwin') {
      await unpackMac(archive, staged, scratch)
    } else {
      // bsdtar (bundled with Windows 10+) reads zip; GNU tar handles .tar.xz on Linux.
      // On Windows a GNU tar from Git may shadow it on PATH, and that one cannot read zip.
      const tar =
        process.platform === 'win32' ? join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
      await run(tar, ['-xf', archive, '-C', staged])
    }
    await fs.access(runtimeExecutable(staged, platform))

    const version =
      (platform === 'darwin'
        ? await readPlistValue(join(staged, 'Telegram.app'), 'CFBundleShortVersionString')
        : null) ??
      /(\d+\.\d+(?:\.\d+)*)/.exec(remoteName)?.[1] ??
      'unknown'
    const manifest: RuntimeManifest = { version, installedAt: Date.now() }
    await fs.writeFile(join(staged, 'runtime.json'), JSON.stringify(manifest))

    await fs.rm(destination, { recursive: true, force: true })
    await fs.rename(staged, destination)
    return manifest
  } finally {
    await fs.rm(scratch, { recursive: true, force: true })
  }
}
