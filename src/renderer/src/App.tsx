import { type ReactElement, useEffect } from 'react'
import { AccountList } from './components/AccountList'
import { AddAccount } from './components/AddAccount'
import { EditAccount } from './components/EditAccount'
import { LockScreen } from './components/LockScreen'
import { Settings } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { CloseIcon } from './components/Icons'
import { t } from '@shared/i18n'
import { useUi } from './store'

function ErrorToast(): ReactElement | null {
  const error = useUi((ui) => ui.error)
  const showError = useUi((ui) => ui.showError)
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => showError(null), 7000)
    return () => clearTimeout(timer)
  }, [error, showError])
  if (!error) return null
  return (
    <div className="toast" role="alert">
      <span>{error}</span>
      <button type="button" className="icon-btn" onClick={() => showError(null)} aria-label={t().common.close}>
        <CloseIcon size={12} />
      </button>
    </div>
  )
}

export function App(): ReactElement | null {
  const app = useUi((ui) => ui.app)
  const sheet = useUi((ui) => ui.sheet)
  const openSheet = useUi((ui) => ui.openSheet)

  if (!app) return null
  if (app.vault.locked) return <LockScreen app={app} />

  const close = (): void => openSheet(null)
  const editing = sheet?.type === 'edit' ? app.accounts.find((account) => account.id === sheet.id) : undefined

  return (
    <div className="window">
      <Sidebar app={app} />
      <AccountList app={app} />
      {sheet?.type === 'add' ? <AddAccount onClose={close} /> : null}
      {sheet?.type === 'settings' ? <Settings app={app} onClose={close} /> : null}
      {editing ? <EditAccount key={editing.id} account={editing} onClose={close} /> : null}
      <ErrorToast />
    </div>
  )
}
