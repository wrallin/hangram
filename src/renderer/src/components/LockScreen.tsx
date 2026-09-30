import { type FormEvent, type ReactElement, useCallback, useEffect, useRef, useState } from 'react'
import type { AppState } from '@shared/types'
import { t } from '@shared/i18n'
import { call, messageOf } from '../store'
import { FingerprintIcon, LockIcon } from './Icons'
import { Button, ErrorText, TextField } from './ui'

export function LockScreen({ app }: { app: AppState }): ReactElement {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const autoPrompted = useRef(false)
  const biometric = app.vault.biometricEnabled && app.vault.biometricAvailable

  const unlockBiometric = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      await call('vault:unlock-biometric')
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }, [])

  // Offer Touch ID once per lock, and only when the user is actually looking at the window.
  useEffect(() => {
    if (!biometric || autoPrompted.current || !document.hasFocus()) return
    autoPrompted.current = true
    void unlockBiometric()
  }, [biometric, unlockBiometric])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!pin || busy) return
    setBusy(true)
    setError('')
    try {
      if (!(await call('vault:unlock', pin))) {
        setError(t().common.wrongPin)
        setShake((value) => value + 1)
        setPin('')
      }
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }

  return (
    <div className="lock">
      <div className="lock-drag" />
      <form className="lock-card" onSubmit={(event) => void submit(event)}>
        <div className="lock-icon">
          <LockIcon size={30} />
        </div>
        <h1>{t().lock.title}</h1>
        <p>{t().lock.text}</p>
        <div key={shake} className={`lock-input ${shake ? 'shake' : ''}`}>
          <TextField
            ref={input}
            type="password"
            placeholder={t().common.pin}
            value={pin}
            autoFocus
            disabled={busy}
            invalid={Boolean(error)}
            onChange={(event) => setPin(event.target.value)}
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="lock-actions">
          <Button variant="primary" type="submit" busy={busy} disabled={!pin}>
            {t().lock.unlock}
          </Button>
          {biometric ? (
            <Button onClick={() => void unlockBiometric()} disabled={busy}>
              <FingerprintIcon size={14} /> Touch ID
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
