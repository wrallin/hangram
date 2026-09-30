import { type ReactElement, useState } from 'react'
import type { Account } from '@shared/types'
import { language, t } from '@shared/i18n'
import { call, displayName, formatPhone, messageOf, subtitle } from '../store'
import { Avatar } from './Avatar'
import { Button, ErrorText, Group, Row, Sheet, Switch, TextField } from './ui'

export function EditAccount({ account, onClose }: { account: Account; onClose: () => void }): ReactElement {
  const [label, setLabel] = useState(account.label)
  const [tags, setTags] = useState(account.tags.join(', '))
  const [note, setNote] = useState(account.note)
  const [pinned, setPinned] = useState(account.pinned)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      await call('accounts:update', account.id, {
        label: label.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        note,
        pinned
      })
      onClose()
    } catch (failure) {
      setError(messageOf(failure))
      setBusy(false)
    }
  }

  const e = t().edit
  const date = new Intl.DateTimeFormat(language(), { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <Sheet
      title={e.title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t().common.cancel}</Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            {t().common.save}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="profile">
          <Avatar account={account} size={56} />
          <div>
            <div className="profile-name">{displayName({ ...account, label: label.trim() })}</div>
            <div className="profile-sub">{subtitle({ ...account, label: label.trim() })}</div>
          </div>
        </div>
        <Group>
          <Row label={e.name}>
            <TextField value={label} maxLength={80} placeholder={displayName({ ...account, label: '' })} onChange={(e) => setLabel(e.target.value)} />
          </Row>
          <Row label={e.tags} hint={e.tagsHint}>
            <TextField value={tags} placeholder={e.tagsPlaceholder} onChange={(e) => setTags(e.target.value)} />
          </Row>
          <Row label={e.pinToTop}>
            <Switch checked={pinned} onChange={setPinned} />
          </Row>
        </Group>
        <Group title={e.note}>
          <textarea className="field textarea" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Group>
        <Group title={e.details}>
          {account.phone ? <Row label={e.phone}><span className="value selectable">{formatPhone(account.phone)}</span></Row> : null}
          {account.username ? <Row label={e.username}><span className="value selectable">@{account.username}</span></Row> : null}
          <Row label="Telegram ID"><span className="value selectable">{account.userId || '—'}</span></Row>
          {account.dcId ? <Row label={e.dc}><span className="value">DC{account.dcId}</span></Row> : null}
          <Row label={e.added}><span className="value">{e.sources[account.source]}, {date.format(account.createdAt)}</span></Row>
          <Row label={e.lastLaunch}><span className="value">{account.lastLaunchedAt ? date.format(account.lastLaunchedAt) : e.never}</span></Row>
        </Group>
        <ErrorText>{error}</ErrorText>
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
