/** RPC router: every renderer call is validated here before it reaches a service. */
import { BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import { z } from 'zod'
import type { IpcCalls, IpcChannel, IpcEnvelope, UiCommand } from '@shared/ipc'
import type { Core } from './app'
import { AppError } from './core/errors'
import { Runtime } from './telegram/runtime'
import { t } from '@shared/i18n'

type Handlers = {
  [C in IpcChannel]: {
    args: z.ZodType<Parameters<IpcCalls[C]>>
    run: (...args: Parameters<IpcCalls[C]>) => Promise<ReturnType<IpcCalls[C]>> | ReturnType<IpcCalls[C]>
  }
}

const none = z.tuple([])
const id = z.uuid()
const secret = z.string().min(1).max(256)

const settingsPatch = z
  .object({
    autoLockMinutes: z.number().int().min(0).max(24 * 60),
    lockOnSleep: z.boolean(),
    disableTelegramUpdates: z.boolean(),
    language: z.enum(['system', 'ru', 'en']),
    apiId: z.string().regex(/^\d{0,12}$/),
    apiHash: z.string().regex(/^[0-9a-f]{0,64}$/i)
  })
  .partial()
  .strict()

const accountPatch = z
  .object({
    label: z.string().max(80),
    tags: z.array(z.string().max(32)).max(12),
    note: z.string().max(2000),
    pinned: z.boolean()
  })
  .partial()
  .strict()

export function registerIpc(
  core: Core,
  getWindow: () => BrowserWindow | null,
  sendCommand: (command: UiCommand) => void
): { importTdata: () => Promise<string | null> } {
  const parent = (): BrowserWindow => {
    const window = getWindow()
    if (!window) throw new AppError(t().errors.windowClosed)
    return window
  }

  const importTdata = async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog(parent(), {
      title: t().dialogs.importTitle,
      message: t().dialogs.importMessage,
      buttonLabel: t().dialogs.importButton,
      properties: ['openDirectory']
    })
    const path = result.filePaths[0]
    return result.canceled || !path ? null : core.accounts.importTdata(path)
  }

  const confirmRemove = async (accountId: string): Promise<boolean> => {
    const account = core.store.get(accountId)
    const name = account.label || [account.firstName, account.lastName].filter(Boolean).join(' ') || t().dialogs.accountFallback
    const { response } = await dialog.showMessageBox(parent(), {
      type: 'warning',
      message: t().dialogs.removeMessage(name),
      detail: t().dialogs.removeDetail,
      buttons: [t().dialogs.remove, t().common.cancel],
      defaultId: 1,
      cancelId: 1
    })
    if (response !== 0) return false
    await core.accounts.remove(accountId)
    return true
  }

  const exportTdata = async (accountId: string): Promise<void> => {
    const result = await dialog.showOpenDialog(parent(), {
      title: t().dialogs.exportTitle,
      message: t().dialogs.exportMessage,
      buttonLabel: t().dialogs.exportButton,
      properties: ['openDirectory', 'createDirectory']
    })
    const target = result.filePaths[0]
    if (result.canceled || !target) return
    shell.showItemInFolder(await core.accounts.exportTdata(accountId, target))
  }

  const showAccountMenu = (accountId: string): void => {
    const account = core.store.get(accountId)
    const running = core.launcher.isRunning(accountId)
    const m = t().accountMenu
    const report = (task: Promise<unknown>): void => {
      task.catch((error: unknown) => {
        dialog.showErrorBox('Hangram', error instanceof Error ? error.message : String(error))
      })
    }
    Menu.buildFromTemplate([
      running
        ? { label: m.stop, click: () => report(core.accounts.stop(accountId)) }
        : { label: m.launch, click: () => report(core.accounts.launch(accountId)) },
      { type: 'separator' },
      { label: m.edit, click: () => sendCommand({ type: 'edit-account', id: accountId }) },
      {
        label: account.pinned ? m.unpin : m.pin,
        click: () => report(core.accounts.update(accountId, { pinned: !account.pinned }))
      },
      { label: m.refresh, click: () => report(core.accounts.refreshProfile(accountId)) },
      { type: 'separator' },
      {
        label: process.platform === 'darwin' ? m.revealMac : m.reveal,
        click: () => void shell.openPath(core.accounts.dir(accountId))
      },
      { label: m.export, click: () => report(exportTdata(accountId)) },
      { type: 'separator' },
      { label: m.remove, click: () => report(confirmRemove(accountId)) }
    ]).popup({ window: parent() })
  }

  const chooseCustomRuntime = async (): Promise<void> => {
    const mac = process.platform === 'darwin'
    const result = await dialog.showOpenDialog(parent(), {
      title: 'Telegram Desktop',
      message: mac ? t().dialogs.chooseTelegramMac : t().errors.chooseExecutable,
      defaultPath: mac ? '/Applications' : undefined,
      properties: ['openFile'],
      filters: mac ? [{ name: t().dialogs.applications, extensions: ['app'] }] : []
    })
    const path = result.filePaths[0]
    if (result.canceled || !path) return
    await Runtime.inspectCustom(path)
    await core.settings.update({ customTelegramPath: path })
    await core.runtime.refresh()
  }

  const handlers: Handlers = {
    'state:get': { args: none, run: () => core.state() },

    'vault:enable': { args: z.tuple([secret]), run: (pin) => core.enableProtection(pin) },
    'vault:disable': { args: z.tuple([secret]), run: (pin) => core.disableProtection(pin) },
    'vault:unlock': { args: z.tuple([secret]), run: (pin) => core.unlock(pin) },
    'vault:unlock-biometric': { args: none, run: () => core.unlockWithBiometric() },
    'vault:lock': { args: none, run: () => core.lock() },
    'vault:change-pin': { args: z.tuple([secret, secret]), run: (a, b) => core.changePin(a, b) },
    'vault:set-biometric': { args: z.tuple([z.boolean()]), run: (enabled) => core.setBiometric(enabled) },
    'vault:add-space': { args: z.tuple([secret]), run: (pin) => core.addSpace(pin) },
    'vault:remove-space': { args: z.tuple([secret]), run: (pin) => core.removeSpace(pin) },

    'settings:update': {
      args: z.tuple([settingsPatch]),
      run: async (patch) => {
        await core.settings.update(patch)
        core.applyLanguage()
        core.notify()
      }
    },

    'runtime:install': { args: none, run: () => void core.runtime.install() },
    'runtime:choose-custom': { args: none, run: chooseCustomRuntime },
    'runtime:reset-custom': {
      args: none,
      run: async () => {
        await core.settings.update({ customTelegramPath: '' })
        await core.runtime.refresh()
      }
    },

    'accounts:launch': { args: z.tuple([id]), run: (accountId) => core.accounts.launch(accountId) },
    'accounts:stop': { args: z.tuple([id]), run: (accountId) => core.accounts.stop(accountId) },
    'accounts:update': { args: z.tuple([id, accountPatch]), run: (accountId, patch) => core.accounts.update(accountId, patch) },
    'accounts:remove': { args: z.tuple([id]), run: confirmRemove },
    'accounts:refresh': { args: z.tuple([id]), run: (accountId) => core.accounts.refreshProfile(accountId) },
    'accounts:reveal': { args: z.tuple([id]), run: (accountId) => void shell.openPath(core.accounts.dir(accountId)) },
    'accounts:export': { args: z.tuple([id]), run: exportTdata },
    'accounts:menu': { args: z.tuple([id]), run: showAccountMenu },
    'accounts:import-tdata': { args: none, run: importTdata },
    'accounts:create-empty': {
      args: none,
      run: async () => {
        const accountId = await core.accounts.createEmpty()
        await core.accounts.launch(accountId)
        return accountId
      }
    },

    'login:phone-start': { args: z.tuple([z.string().min(5).max(32)]), run: (phone) => core.login.phoneStart(phone) },
    'login:resend-code': { args: z.tuple([id]), run: (flowId) => core.login.resendCode(flowId) },
    'login:submit-code': { args: z.tuple([id, z.string().min(1).max(16)]), run: (flowId, code) => core.login.submitCode(flowId, code) },
    'login:submit-password': { args: z.tuple([id, secret]), run: (flowId, password) => core.login.submitPassword(flowId, password) },
    'login:qr-start': { args: none, run: () => core.login.qrStart() },
    'login:import-session': { args: z.tuple([z.string().min(16).max(4096)]), run: (value) => core.login.importSession(value) },
    'login:cancel': { args: z.tuple([id]), run: (flowId) => core.login.cancel(flowId) }
  }

  ipcMain.handle('rpc', async (event, channel: unknown, args: unknown): Promise<IpcEnvelope<unknown>> => {
    try {
      // Only our own top-level page may talk to the core.
      if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) {
        throw new AppError('forbidden')
      }
      if (typeof channel !== 'string' || !Object.hasOwn(handlers, channel)) throw new AppError('unknown call')
      const handler = handlers[channel as IpcChannel] as {
        args: z.ZodType<unknown[]>
        run: (...args: unknown[]) => unknown
      }
      const parsed = handler.args.safeParse(args)
      if (!parsed.success) throw new AppError(t().errors.invalidInput)
      return { ok: true, value: await handler.run(...parsed.data) }
    } catch (error) {
      if (error instanceof AppError) return { ok: false, error: error.message, code: error.code }
      console.error(`[rpc] ${String(channel)}`, error)
      return { ok: false, error: error instanceof Error ? error.message : String(error), code: 'internal' }
    }
  })

  return { importTdata }
}
