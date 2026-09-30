import { Menu, type MenuItemConstructorOptions, app } from 'electron'
import type { UiCommand } from '@shared/ipc'
import { t } from '@shared/i18n'

export interface MenuActions {
  command: (command: UiCommand) => void
  importTdata: () => void
  lock: () => void
}

/** Builds the application menu in the current language; call again when the language changes. */
export function installMenu(actions: MenuActions): void {
  const mac = process.platform === 'darwin'
  const m = t().menu
  const settings: MenuItemConstructorOptions = {
    label: m.settings,
    accelerator: 'CmdOrCtrl+,',
    click: () => actions.command({ type: 'settings' })
  }
  const lock: MenuItemConstructorOptions = {
    label: m.lock,
    accelerator: 'CmdOrCtrl+L',
    click: actions.lock
  }

  const template: MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: m.about(app.name) },
              { type: 'separator' },
              settings,
              { type: 'separator' },
              lock,
              { type: 'separator' },
              { role: 'hide', label: m.hide(app.name) },
              { role: 'hideOthers', label: m.hideOthers },
              { role: 'unhide', label: m.unhide },
              { type: 'separator' },
              { role: 'quit', label: m.quitApp(app.name) }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: m.file,
      submenu: [
        { label: m.addAccount, accelerator: 'CmdOrCtrl+N', click: () => actions.command({ type: 'add-account' }) },
        { label: m.importTdata, accelerator: 'CmdOrCtrl+O', click: actions.importTdata },
        ...(mac
          ? [{ type: 'separator' } as const, { role: 'close', label: m.closeWindow } as const]
          : [{ type: 'separator' } as const, settings, lock, { type: 'separator' } as const, { role: 'quit', label: m.quit } as const])
      ]
    },
    {
      label: m.edit,
      submenu: [
        { role: 'undo', label: m.undo },
        { role: 'redo', label: m.redo },
        { type: 'separator' },
        { role: 'cut', label: m.cut },
        { role: 'copy', label: m.copy },
        { role: 'paste', label: m.paste },
        { role: 'selectAll', label: m.selectAll },
        { type: 'separator' },
        { label: m.find, accelerator: 'CmdOrCtrl+F', click: () => actions.command({ type: 'find' }) }
      ]
    },
    {
      label: m.view,
      submenu: [
        ...(app.isPackaged
          ? []
          : [{ role: 'reload' } as const, { role: 'toggleDevTools' } as const, { type: 'separator' } as const]),
        { role: 'togglefullscreen', label: m.fullscreen }
      ]
    },
    {
      label: m.window,
      role: 'window',
      submenu: [
        { role: 'minimize', label: m.minimize },
        { role: 'zoom', label: m.zoom },
        ...(mac ? [{ type: 'separator' } as const, { role: 'front', label: m.front } as const] : [])
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
