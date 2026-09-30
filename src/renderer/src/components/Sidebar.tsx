import type { ReactElement, ReactNode } from 'react'
import type { AppState } from '@shared/types'
import { language, t } from '@shared/i18n'
import { type Filter, act, useUi } from '../store'
import { GearIcon, LockIcon, PeopleIcon, PinIcon, PlayIcon, TagIcon } from './Icons'

function Item({ filter, icon, label, count }: { filter: Filter; icon: ReactNode; label: string; count?: number }): ReactElement {
  const current = useUi((ui) => ui.filter)
  const setFilter = useUi((ui) => ui.setFilter)
  const active = current.kind === filter.kind && (filter.kind !== 'tag' || (current as { tag?: string }).tag === filter.tag)
  return (
    <button type="button" className={`side-item ${active ? 'side-item-active' : ''}`} onClick={() => setFilter(filter)}>
      <span className="side-icon">{icon}</span>
      <span className="side-label">{label}</span>
      {count ? <span className="side-count">{count}</span> : null}
    </button>
  )
}

export function Sidebar({ app }: { app: AppState }): ReactElement {
  const openSheet = useUi((ui) => ui.openSheet)
  const tags = [...new Set(app.accounts.flatMap((account) => account.tags))].sort((a, b) => a.localeCompare(b, language()))
  const s = t().sidebar
  const pinned = app.accounts.filter((account) => account.pinned).length

  return (
    <aside className="sidebar">
      <div className="sidebar-drag" />
      <nav className="sidebar-scroll">
        <Item filter={{ kind: 'all' }} icon={<PeopleIcon />} label={s.all} count={app.accounts.length} />
        <Item filter={{ kind: 'running' }} icon={<PlayIcon />} label={s.running} count={app.running.length} />
        {pinned > 0 ? <Item filter={{ kind: 'pinned' }} icon={<PinIcon />} label={s.pinned} count={pinned} /> : null}
        {tags.length > 0 ? (
          <>
            <div className="side-heading">{s.tags}</div>
            {tags.map((tag) => (
              <Item
                key={tag}
                filter={{ kind: 'tag', tag }}
                icon={<TagIcon />}
                label={tag}
                count={app.accounts.filter((account) => account.tags.includes(tag)).length}
              />
            ))}
          </>
        ) : null}
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="side-item" onClick={() => openSheet({ type: 'settings' })}>
          <span className="side-icon">
            <GearIcon />
          </span>
          <span className="side-label">{s.settings}</span>
        </button>
        {app.vault.enabled ? (
          <button type="button" className="side-item" onClick={() => act('vault:lock')}>
            <span className="side-icon">
              <LockIcon />
            </span>
            <span className="side-label">{s.lock}</span>
          </button>
        ) : null}
      </div>
    </aside>
  )
}
