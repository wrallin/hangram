import { type ReactElement, useState } from 'react'
import { LANGUAGE_NAMES, type LanguagePreference, t } from '@shared/i18n'
import type { AppState } from '@shared/types'
import { act, call, messageOf } from '../store'
import { ShieldIcon } from './Icons'
import { Button, ErrorText, Group, Row, Sheet, Switch, TextField } from './ui'

type Tab = 'security' | 'telegram' | 'general' | 'about'

const AUTO_LOCK_MINUTES = [0, 1, 5, 10, 30, 60]
const LANGUAGES: LanguagePreference[] = ['system', 'ru', 'en']

function useTask(): { busy: boolean; error: string; run: (task: () => Promise<unknown>) => Promise<boolean>; setError: (e: string) => void } {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (task: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      await task()
      return true
    } catch (failure) {
      setError(messageOf(failure))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, setError }
}

function EnableProtection(): ReactElement {
  const [pin, setPin] = useState('')
  const [repeat, setRepeat] = useState('')
  const task = useTask()
  const s = t().settings
  const submit = (): void => {
    if (pin !== repeat) return task.setError(s.pinMismatch)
    void task.run(() => call('vault:enable', pin))
  }
  return (
    <>
      <div className="hero">
        <ShieldIcon size={28} />
        <p>{s.protectionIntro}</p>
      </div>
      <Group footer={s.pinFooter}>
        <Row label={t().common.pin}>
          <TextField type="password" value={pin} placeholder={s.pinPlaceholder} onChange={(e) => setPin(e.target.value)} />
        </Row>
        <Row label={t().common.repeat}>
          <TextField type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </Row>
      </Group>
      <ErrorText>{task.error}</ErrorText>
      <div className="actions">
        <Button variant="primary" busy={task.busy} disabled={pin.length < 4 || !repeat} onClick={submit}>
          {s.enable}
        </Button>
      </div>
    </>
  )
}

function ManageProtection({ app }: { app: AppState }): ReactElement {
  const [mode, setMode] = useState<'idle' | 'change' | 'disable'>('idle')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const task = useTask()
  const bio = useTask()
  const s = t().settings

  const reset = (): void => {
    setMode('idle')
    setCurrent('')
    setNext('')
    setRepeat('')
    task.setError('')
  }

  const confirm = async (): Promise<void> => {
    if (mode === 'change') {
      if (next !== repeat) return task.setError(s.newPinMismatch)
      if (await task.run(() => call('vault:change-pin', current, next))) reset()
    } else if (mode === 'disable') {
      if (await task.run(() => call('vault:disable', current))) reset()
    }
  }

  return (
    <>
      <Group title={s.locking}>
        {app.vault.biometricAvailable ? (
          <Row label={s.touchId} hint={s.touchIdHint}>
            <Switch checked={app.vault.biometricEnabled} disabled={bio.busy} onChange={(value) => void bio.run(() => call('vault:set-biometric', value))} />
          </Row>
        ) : null}
        <Row label={s.lockOnIdle}>
          <select className="select" value={app.settings.autoLockMinutes} onChange={(e) => act('settings:update', { autoLockMinutes: Number(e.target.value) })}>
            {AUTO_LOCK_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {s.autoLock(minutes)}
              </option>
            ))}
          </select>
        </Row>
        <Row label={s.lockOnSleep}>
          <Switch checked={app.settings.lockOnSleep} onChange={(value) => act('settings:update', { lockOnSleep: value })} />
        </Row>
      </Group>
      <ErrorText>{bio.error}</ErrorText>

      {mode === 'idle' ? (
        <Group title={t().common.pin} footer={s.pinFooterManage}>
          <Row label={s.changePin}>
            <Button onClick={() => setMode('change')}>{s.change}</Button>
          </Row>
          <Row label={s.disable} hint={s.disableHint}>
            <Button variant="destructive" onClick={() => setMode('disable')}>
              {s.disableButton}
            </Button>
          </Row>
        </Group>
      ) : (
        <>
          <Group title={mode === 'change' ? s.changingPin : s.disabling}>
            <Row label={s.currentPin}>
              <TextField type="password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Row>
            {mode === 'change' ? (
              <>
                <Row label={s.newPin}>
                  <TextField type="password" value={next} onChange={(e) => setNext(e.target.value)} />
                </Row>
                <Row label={t().common.repeat}>
                  <TextField type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
                </Row>
              </>
            ) : null}
          </Group>
          <ErrorText>{task.error}</ErrorText>
          <div className="actions">
            <Button onClick={reset}>{t().common.cancel}</Button>
            <Button
              variant={mode === 'disable' ? 'destructive' : 'primary'}
              busy={task.busy}
              disabled={!current || (mode === 'change' && (next.length < 4 || !repeat))}
              onClick={() => void confirm()}
            >
              {mode === 'change' ? s.changePin : s.decryptAndDisable}
            </Button>
          </div>
        </>
      )}
    </>
  )
}

function TelegramTab({ app }: { app: AppState }): ReactElement {
  const runtime = app.runtime
  const [apiId, setApiId] = useState(app.settings.apiId)
  const [apiHash, setApiHash] = useState(app.settings.apiHash)
  const task = useTask()
  const s = t().settings
  const working = runtime.status === 'downloading' || runtime.status === 'installing'
  const status =
    runtime.status === 'ready'
      ? s.runtimeVersion(runtime.version, runtime.origin === 'custom')
      : runtime.status === 'downloading'
        ? s.downloading(runtime.total ? Math.round((runtime.received / runtime.total) * 100) : null)
        : runtime.status === 'installing'
          ? s.installing
          : runtime.status === 'error'
            ? runtime.message
            : s.notInstalled

  return (
    <>
      <Group title="Telegram Desktop" footer={s.telegramFooter}>
        <Row label={s.client} hint={status}>
          <Button disabled={working || app.running.length > 0} onClick={() => act('runtime:install')} title={app.running.length > 0 ? s.closeClientsFirst : undefined}>
            {runtime.status === 'ready' && runtime.origin === 'managed' ? s.reinstall : s.download}
          </Button>
        </Row>
        <Row label={s.customBuild} hint={app.settings.customTelegramPath || s.customBuildHint}>
          {app.settings.customTelegramPath ? (
            <Button onClick={() => void task.run(() => call('runtime:reset-custom'))}>{s.reset}</Button>
          ) : (
            <Button onClick={() => void task.run(() => call('runtime:choose-custom'))}>{s.choose}</Button>
          )}
        </Row>
        <Row label={s.noUpdates} hint={s.noUpdatesHint}>
          <Switch checked={app.settings.disableTelegramUpdates} onChange={(value) => act('settings:update', { disableTelegramUpdates: value })} />
        </Row>
      </Group>
      <Group
        title={s.apiTitle}
        footer={
          <>
            {s.apiFooter}{' '}
            <a href="https://my.telegram.org/apps" target="_blank" rel="noreferrer">
              my.telegram.org
            </a>
            .
          </>
        }
      >
        <Row label="api_id">
          <TextField value={apiId} placeholder={s.byDefault} inputMode="numeric" onChange={(e) => setApiId(e.target.value.replace(/\D/g, ''))} onBlur={() => void task.run(() => call('settings:update', { apiId }))} />
        </Row>
        <Row label="api_hash">
          <TextField value={apiHash} placeholder={s.byDefault} className="mono" onChange={(e) => setApiHash(e.target.value.trim())} onBlur={() => void task.run(() => call('settings:update', { apiHash }))} />
        </Row>
      </Group>
      <ErrorText>{task.error}</ErrorText>
    </>
  )
}

export function Settings({ app, onClose }: { app: AppState; onClose: () => void }): ReactElement {
  const [tab, setTab] = useState<Tab>('security')
  const s = t().settings
  const tabs: Tab[] = ['security', 'telegram', 'general', 'about']
  return (
    <Sheet title={s.title} onClose={onClose} width={520}>
      <div className="segmented" role="tablist">
        {tabs.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'segment segment-active' : 'segment'} onClick={() => setTab(id)}>
            {s.tabs[id]}
          </button>
        ))}
      </div>
      <div className="settings-pane">
        {tab === 'security' ? app.vault.enabled ? <ManageProtection app={app} /> : <EnableProtection /> : null}
        {tab === 'telegram' ? <TelegramTab app={app} /> : null}
        {tab === 'general' ? (
          <Group>
            <Row label={s.language}>
              <select
                className="select"
                value={app.settings.language}
                onChange={(e) => act('settings:update', { language: e.target.value as LanguagePreference })}
              >
                {LANGUAGES.map((value) => (
                  <option key={value} value={value}>
                    {value === 'system' ? s.languageSystem : LANGUAGE_NAMES[value]}
                  </option>
                ))}
              </select>
            </Row>
          </Group>
        ) : null}
        {tab === 'about' ? (
          <div className="about">
            <h3>Hangram</h3>
            <p>{s.version(app.version)}</p>
            <p>{s.aboutText}</p>
            <p>{s.notOfficial}</p>
          </div>
        ) : null}
      </div>
    </Sheet>
  )
}
