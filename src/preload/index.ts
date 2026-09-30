import { contextBridge, ipcRenderer } from 'electron'
import type { Bridge, IpcEnvelope } from '@shared/ipc'

const EVENTS = new Set(['state', 'login', 'command'])

const bridge: Bridge = {
  async invoke(channel, ...args) {
    const reply = (await ipcRenderer.invoke('rpc', channel, args)) as IpcEnvelope<never>
    if (reply.ok) return reply.value
    throw Object.assign(new Error(reply.error), { code: reply.code })
  },
  on(event, listener) {
    if (!EVENTS.has(event)) throw new Error(`unknown event: ${event}`)
    const handler = (_: unknown, payload: unknown): void => (listener as (value: unknown) => void)(payload)
    ipcRenderer.on(`event:${event}`, handler)
    return () => ipcRenderer.removeListener(`event:${event}`, handler)
  }
}

contextBridge.exposeInMainWorld('hangram', bridge)
