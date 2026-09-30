import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { isNodeError } from './errors'

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/** Write-then-rename so readers never observe a half-written file. */
export async function writeFileAtomic(path: string, data: Buffer | string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = join(dirname(path), `.${randomBytes(6).toString('hex')}.tmp`)
  const handle = await fs.open(tmp, 'w', 0o600)
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await fs.rename(tmp, path)
  } catch (error) {
    await fs.rm(tmp, { force: true })
    throw error
  }
}

export async function readFileIfExists(path: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null
    throw error
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  const raw = await readFileIfExists(path)
  if (!raw) return null
  try {
    return JSON.parse(raw.toString('utf8')) as T
  } catch {
    return null
  }
}

/** Runs tasks one after another; a failed task does not poison the queue. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task)
    this.tail = next.catch(() => undefined)
    return next
  }
}
