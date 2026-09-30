import { create } from 'zustand'
import { language, setLanguage, t } from '@shared/i18n'
import type { IpcArgs, IpcChannel, IpcResult } from '@shared/ipc'
import type { Account, AppState, LoginEvent } from '@shared/types'

export type Filter = { kind: 'all' } | { kind: 'running' } | { kind: 'pinned' } | { kind: 'tag'; tag: string }

export type Sheet = { type: 'add' } | { type: 'edit'; id: string } | { type: 'settings' } | null

interface UiState {
  app: AppState | null
  filter: Filter
  query: string
  selectedId: string | null
  sheet: Sheet
  error: string | null
  /** Bumped to ask the search field to take focus. */
  findTick: number
  setFilter: (filter: Filter) => void
  setQuery: (query: string) => void
  select: (id: string | null) => void
  openSheet: (sheet: Sheet) => void
  showError: (message: string | null) => void
}

export const useUi = create<UiState>((set) => ({
  app: null,
  filter: { kind: 'all' },
  query: '',
  selectedId: null,
  sheet: null,
  error: null,
  findTick: 0,
  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),
  select: (selectedId) => set({ selectedId }),
  openSheet: (sheet) => set({ sheet }),
  showError: (error) => set({ error })
}))

/** Typed RPC to the main process. Rejects with a user-presentable message. */
export const call = <C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<C>> =>
  window.hangram.invoke(channel, ...args)

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Fire-and-report: for actions whose only failure mode is "tell the user". */
export function act<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): void {
  call(channel, ...args).catch((error: unknown) => useUi.getState().showError(messageOf(error)))
}

const loginListeners = new Set<(event: LoginEvent) => void>()
export function onLoginEvent(listener: (event: LoginEvent) => void): () => void {
  loginListeners.add(listener)
  return () => loginListeners.delete(listener)
}

function applyState(app: AppState): void {
  // Before the store update, so that the render it triggers already reads the new language.
  setLanguage(app.lang)
  const root = document.documentElement
  root.lang = app.lang
  root.dataset['platform'] = app.platform
  if (app.accent) root.style.setProperty('--accent', app.accent)
  useUi.setState((ui) => {
    const locked = app.vault.locked
    const ids = new Set(app.accounts.map((account) => account.id))
    const tagGone = ui.filter.kind === 'tag' && !app.accounts.some((a) => a.tags.includes((ui.filter as { tag: string }).tag))
    return {
      app,
      selectedId: ui.selectedId && ids.has(ui.selectedId) ? ui.selectedId : null,
      // Nothing account-related may linger on screen once the vault locks.
      sheet: locked || (ui.sheet?.type === 'edit' && !ids.has(ui.sheet.id)) ? null : ui.sheet,
      filter: tagGone || locked ? { kind: 'all' } : ui.filter,
      query: locked ? '' : ui.query
    }
  })
}

export function bootstrap(): void {
  window.hangram.on('state', applyState)
  window.hangram.on('login', (event) => loginListeners.forEach((listener) => listener(event)))
  window.hangram.on('command', (command) => {
    const ui = useUi.getState()
    if (!ui.app || ui.app.vault.locked) return
    switch (command.type) {
      case 'add-account':
        return ui.openSheet({ type: 'add' })
      case 'settings':
        return ui.openSheet({ type: 'settings' })
      case 'edit-account':
        return ui.openSheet({ type: 'edit', id: command.id })
      case 'find':
        return useUi.setState({ findTick: ui.findTick + 1 })
    }
  })
  void call('state:get').then(applyState)
}

// ── derived data ──────────────────────────────────────────────────────────────

export function displayName(account: Account): string {
  return (
    account.label ||
    [account.firstName, account.lastName].filter(Boolean).join(' ') ||
    (account.username ? `@${account.username}` : '') ||
    account.phone ||
    (account.userId ? `ID ${account.userId}` : t().account.newProfile)
  )
}

export function subtitle(account: Account): string {
  const parts: string[] = []
  if (account.label) {
    const real = [account.firstName, account.lastName].filter(Boolean).join(' ')
    if (real) parts.push(real)
  }
  if (account.username) parts.push(`@${account.username}`)
  if (account.phone) parts.push(formatPhone(account.phone))
  if (parts.length === 0) {
    if (account.passcodeProtected) return t().account.passcodeProtected
    if (account.userId) return account.label ? `ID ${account.userId}` : t().account.profileNotLoaded
    return t().account.notLoggedIn
  }
  return parts.join(' · ')
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`
  }
  return phone
}

export function visibleAccounts(app: AppState, filter: Filter, query: string): Account[] {
  const running = new Set(app.running)
  const needle = query.trim().toLowerCase()
  return app.accounts
    .filter((account) => {
      if (filter.kind === 'running' && !running.has(account.id)) return false
      if (filter.kind === 'pinned' && !account.pinned) return false
      if (filter.kind === 'tag' && !account.tags.includes(filter.tag)) return false
      if (!needle) return true
      return [displayName(account), account.firstName, account.lastName, account.username, account.phone, account.userId, account.note, ...account.tags]
        .join('\n')
        .toLowerCase()
        .includes(needle)
    })
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        displayName(a).localeCompare(displayName(b), language()) ||
        a.createdAt - b.createdAt
    )
}
