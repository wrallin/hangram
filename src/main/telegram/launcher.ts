/**
 * Starts Telegram Desktop clients, one per account, and tracks their lifetime.
 *
 * Clients are detached: they outlive the launcher unless it decides to stop them.
 * A small pid file lets a restarted launcher re-adopt clients that are still running.
 */
import { execFile, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import { join, sep } from 'node:path'
import { promisify } from 'node:util'
import type { Biometric } from '../core/biometric'
import { readJson, writeFileAtomic } from '../core/fsx'

const run = promisify(execFile)
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const PID_FILE = 'client.json'
const ADOPTED_POLL_MS = 4000
const POLITE_TIMEOUT_MS = 6000
const TERM_TIMEOUT_MS = 3000

interface Client {
  pid: number
  exited: Promise<void>
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means "exists, but not ours" — still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function looksLikeTelegram(pid: number): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'])
      return /telegram/i.test(stdout)
    }
    const { stdout } = await run('ps', ['-p', String(pid), '-o', 'command='])
    return /telegram/i.test(stdout)
  } catch {
    return false
  }
}

export interface LauncherEvents {
  exit: [id: string]
}

export class Launcher extends EventEmitter<LauncherEvents> {
  private readonly clients = new Map<string, Client>()
  private readonly adopted = new Map<string, () => void>()
  private pollTimer: NodeJS.Timeout | null = null

  constructor(private readonly native: Biometric) {
    super()
  }

  isRunning(id: string): boolean {
    return this.clients.has(id)
  }

  runningIds(): string[] {
    return [...this.clients.keys()]
  }

  private register(id: string, pid: number, exited: Promise<void>, accountDir: string): void {
    this.clients.set(id, { pid, exited })
    void exited.then(async () => {
      this.clients.delete(id)
      await fs.rm(join(accountDir, PID_FILE), { force: true })
      this.emit('exit', id)
    })
  }

  async launch(id: string, accountDir: string, executable: string, extraArgs: string[]): Promise<void> {
    if (this.clients.has(id)) return
    // Telegram treats -workdir as a prefix, so the trailing separator matters.
    const child = spawn(executable, ['-workdir', accountDir + sep, ...extraArgs], {
      detached: true,
      stdio: 'ignore',
      cwd: accountDir
    })
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve())
      child.once('error', () => resolve())
    })
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    })
    child.unref()
    const pid = child.pid!
    await writeFileAtomic(join(accountDir, PID_FILE), JSON.stringify({ pid }))
    this.register(id, pid, exited, accountDir)
  }

  /** Re-attaches to a client started by a previous launcher session, if it still runs. */
  async adopt(id: string, accountDir: string): Promise<boolean> {
    if (this.clients.has(id)) return true
    const record = await readJson<{ pid: number }>(join(accountDir, PID_FILE))
    if (!record) return false
    const pid = record.pid
    if (!Number.isInteger(pid) || !isAlive(pid) || !(await looksLikeTelegram(pid))) {
      await fs.rm(join(accountDir, PID_FILE), { force: true })
      return false
    }
    const exited = new Promise<void>((resolve) => this.adopted.set(id, resolve))
    this.register(id, pid, exited, accountDir)
    // We are not the parent, so there is no exit event: poll, but only while needed.
    this.pollTimer ??= setInterval(() => this.pollAdopted(), ADOPTED_POLL_MS)
    return true
  }

  private pollAdopted(): void {
    for (const [id, resolve] of this.adopted) {
      const client = this.clients.get(id)
      if (!client || !isAlive(client.pid)) {
        this.adopted.delete(id)
        resolve()
      }
    }
    if (this.adopted.size === 0 && this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async waitExit(client: Client, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    let done = false
    void client.exited.then(() => (done = true))
    while (!done && Date.now() < deadline) {
      if (!isAlive(client.pid)) {
        // Dead for sure; let the bookkeeping (pid file, 'exit' event) settle before returning.
        this.pollAdopted()
        await client.exited
        return true
      }
      await sleep(150)
    }
    return done
  }

  /** Quits the client: politely first, then firmly. Resolves once the process is gone. */
  async stop(id: string): Promise<void> {
    const client = this.clients.get(id)
    if (!client) return
    const { pid } = client

    if (process.platform === 'darwin') {
      if ((await this.native.quitApp(pid)) && (await this.waitExit(client, POLITE_TIMEOUT_MS))) return
    } else if (process.platform === 'win32') {
      await run('taskkill', ['/PID', String(pid)]).catch(() => undefined)
      if (await this.waitExit(client, POLITE_TIMEOUT_MS)) return
    }

    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
    if (await this.waitExit(client, TERM_TIMEOUT_MS)) return

    if (process.platform === 'win32') {
      await run('taskkill', ['/PID', String(pid), '/T', '/F']).catch(() => undefined)
    } else {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* already gone */
      }
    }
    await this.waitExit(client, TERM_TIMEOUT_MS)
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.runningIds().map((id) => this.stop(id)))
  }
}
