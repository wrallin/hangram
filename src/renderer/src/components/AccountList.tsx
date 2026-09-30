import { type ReactElement, useEffect, useMemo, useRef } from 'react'
import type { Account, AppState } from '@shared/types'
import { t } from '@shared/i18n'
import { type Filter, act, displayName, subtitle, useUi, visibleAccounts } from '../store'
import { Avatar } from './Avatar'
import { DownloadIcon, PinIcon, PlusIcon, SearchIcon } from './Icons'
import { Button, Spinner } from './ui'

function RuntimeBanner({ app }: { app: AppState }): ReactElement | null {
  const runtime = app.runtime
  const l = t().list
  if (runtime.status === 'ready') return null
  const percent =
    runtime.status === 'downloading' && runtime.total ? Math.round((runtime.received / runtime.total) * 100) : null
  return (
    <div className="banner">
      <DownloadIcon size={18} />
      <div className="banner-text">
        {runtime.status === 'missing' ? (
          <>
            <strong>{l.needTelegram}</strong>
            <span>{l.needTelegramText}</span>
          </>
        ) : runtime.status === 'error' ? (
          <>
            <strong>{l.installFailed}</strong>
            <span>{runtime.message}</span>
          </>
        ) : (
          <>
            <strong>{runtime.status === 'installing' ? l.installing : l.downloading}</strong>
            <div className="progress" role="progressbar" aria-valuenow={percent ?? undefined}>
              <div
                className={`progress-bar ${percent === null ? 'progress-indeterminate' : ''}`}
                style={percent === null ? undefined : { width: `${percent}%` }}
              />
            </div>
          </>
        )}
      </div>
      {runtime.status === 'missing' || runtime.status === 'error' ? (
        <Button variant="primary" onClick={() => act('runtime:install')}>
          {runtime.status === 'error' ? l.retry : l.download}
        </Button>
      ) : null}
    </div>
  )
}

interface RowProps {
  account: Account
  running: boolean
  busy: boolean
  selected: boolean
}

function AccountRow({ account, running, busy, selected }: RowProps): ReactElement {
  const select = useUi((ui) => ui.select)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      className={`account ${selected ? 'account-selected' : ''}`}
      onMouseDown={() => select(account.id)}
      onDoubleClick={() => act(running ? 'accounts:stop' : 'accounts:launch', account.id)}
      onContextMenu={(event) => {
        event.preventDefault()
        select(account.id)
        act('accounts:menu', account.id)
      }}
    >
      <div className="account-avatar">
        <Avatar account={account} />
        {running ? <span className="online-dot" title={t().list.telegramRunning} /> : null}
      </div>
      <div className="account-text">
        <div className="account-name">
          <span>{displayName(account)}</span>
          {account.pinned ? <PinIcon size={11} className="account-pin" /> : null}
          {account.innerAccounts > 1 ? <span className="chip">+{account.innerAccounts - 1}</span> : null}
        </div>
        <div className="account-sub">{subtitle(account)}</div>
      </div>
      <div className="account-tags">
        {account.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="chip">
            {tag}
          </span>
        ))}
      </div>
      <div className="account-action">
        {busy ? (
          <Spinner />
        ) : (
          <button
            type="button"
            className={`pill ${running ? 'pill-running' : ''}`}
            onMouseDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={() => act(running ? 'accounts:stop' : 'accounts:launch', account.id)}
          >
            {running ? t().list.close : t().list.open}
          </button>
        )}
      </div>
    </div>
  )
}

function title(filter: Filter): string {
  switch (filter.kind) {
    case 'all':
      return t().sidebar.all
    case 'running':
      return t().sidebar.running
    case 'pinned':
      return t().sidebar.pinned
    case 'tag':
      return filter.tag
  }
}

export function AccountList({ app }: { app: AppState }): ReactElement {
  const { filter, query, selectedId, findTick } = useUi()
  const setQuery = useUi((ui) => ui.setQuery)
  const select = useUi((ui) => ui.select)
  const openSheet = useUi((ui) => ui.openSheet)
  const searchRef = useRef<HTMLInputElement>(null)

  const accounts = useMemo(() => visibleAccounts(app, filter, query), [app, filter, query])
  const running = useMemo(() => new Set(app.running), [app.running])
  const busy = useMemo(() => new Set(app.busy), [app.busy])

  useEffect(() => {
    if (findTick > 0) searchRef.current?.focus()
  }, [findTick])

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (accounts.length === 0) return
    const index = accounts.findIndex((account) => account.id === selectedId)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const next = index < 0 ? (delta > 0 ? 0 : accounts.length - 1) : Math.min(accounts.length - 1, Math.max(0, index + delta))
      select(accounts[next]!.id)
    } else if (event.key === 'Enter' && selectedId) {
      event.preventDefault()
      act(running.has(selectedId) ? 'accounts:stop' : 'accounts:launch', selectedId)
    } else if ((event.key === 'Backspace' || event.key === 'Delete') && selectedId && event.metaKey) {
      event.preventDefault()
      act('accounts:remove', selectedId)
    }
  }

  const total = accounts.length
  const l = t().list
  return (
    <main className="content">
      <header className="toolbar">
        <div className="toolbar-title">
          <h1>{title(filter)}</h1>
          <span>{l.count(total)}</span>
        </div>
        <label className="search">
          <SearchIcon size={13} />
          <input
            ref={searchRef}
            type="search"
            placeholder={l.search}
            value={query}
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('')
                event.currentTarget.blur()
              } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
                onKeyDown(event)
              }
            }}
          />
        </label>
        <button type="button" className="toolbar-btn" title={`${l.addAccount} (${app.platform === 'darwin' ? '⌘N' : 'Ctrl+N'})`} onClick={() => openSheet({ type: 'add' })}>
          <PlusIcon />
        </button>
      </header>

      <RuntimeBanner app={app} />

      {accounts.length > 0 ? (
        <div className="list" role="listbox" tabIndex={0} aria-label={l.accounts} onKeyDown={onKeyDown}>
          {accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              running={running.has(account.id)}
              busy={busy.has(account.id)}
              selected={account.id === selectedId}
            />
          ))}
        </div>
      ) : (
        <div className="empty">
          {app.accounts.length === 0 ? (
            <>
              <div className="empty-art">
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                  <circle cx="28" cy="28" r="27" fill="currentColor" opacity=".08" />
                  <path d="M40.500 17.200 35.800 40c-.300 1.500-1.300 1.900-2.600 1.200l-7.200-5.300-3.500 3.400c-.4.400-.7.700-1.500.7l.5-7.400 13.500-12.200c.6-.5-.1-.8-.9-.300L17.400 30.600l-7.100-2.200c-1.500-.5-1.600-1.500.3-2.300l27.800-10.700c1.300-.5 2.400.3 2.100 1.800Z" fill="currentColor" opacity=".55" />
                </svg>
              </div>
              <h2>{l.emptyTitle}</h2>
              <p>{l.emptyText}</p>
              <Button variant="primary" onClick={() => openSheet({ type: 'add' })}>
                {l.addAccount}
              </Button>
            </>
          ) : (
            <>
              <h2>{l.nothingFound}</h2>
              <p>{query ? l.noMatches(query) : l.emptySection}</p>
            </>
          )}
        </div>
      )}
    </main>
  )
}
