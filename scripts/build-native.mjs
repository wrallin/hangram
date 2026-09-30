// Builds the Touch ID / Secure Enclave helper. macOS only; a no-op elsewhere.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') process.exit(0)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'native/biometric/main.swift')
const outDir = join(root, 'resources/bin')
const out = join(outDir, 'hangram-biometric')
mkdirSync(outDir, { recursive: true })

const build = (arch) => {
  const target = join(outDir, `hangram-biometric-${arch}`)
  execFileSync('swiftc', ['-O', '-target', `${arch}-apple-macos12.0`, src, '-o', target], {
    stdio: 'inherit'
  })
  return target
}

try {
  const slices = ['arm64', 'x86_64'].map(build)
  execFileSync('lipo', ['-create', ...slices, '-output', out], { stdio: 'inherit' })
  slices.forEach((s) => rmSync(s))
  execFileSync('codesign', ['--force', '--sign', '-', out], { stdio: 'inherit' })
  console.log('built', out)
} catch (error) {
  // Touch ID is optional: the app works without the helper, the option is just hidden.
  console.warn('biometric helper was not built:', error.message)
}
