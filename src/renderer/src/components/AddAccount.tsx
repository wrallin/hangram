import QRCode from 'qrcode'
import { type FormEvent, type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n'
import { call, messageOf, onLoginEvent, useUi } from '../store'
import { ChevronIcon, FolderIcon, KeyIcon, PhoneIcon, QrIcon, WindowIcon } from './Icons'
import { Button, ErrorText, Sheet, Spinner, TextField } from './ui'

type Step =
  | { name: 'choose' }
  | { name: 'phone' }
  | { name: 'code'; flowId: string; phone: string; via: 'app' | 'sms' | 'other'; length: number | null }
  | { name: 'password'; flowId: string; hint: string }
  | { name: 'qr' }
  | { name: 'session' }

function Method({ icon, title, text, onClick, disabled }: { icon: ReactNode; title: string; text: string; onClick: () => void; disabled?: boolean }): ReactElement {
  return (
    <button type="button" className="method" onClick={onClick} disabled={disabled}>
      <span className="method-icon">{icon}</span>
      <span className="method-text">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
      <ChevronIcon size={12} className="method-chevron" />
    </button>
  )
}

export function AddAccount({ onClose }: { onClose: () => void }): ReactElement {
  const [step, setStep] = useState<Step>({ name: 'choose' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [value, setValue] = useState('')
  const flowRef = useRef<string | null>(null)
  const select = useUi((ui) => ui.select)
  const runtimeReady = useUi((ui) => ui.app?.runtime.status === 'ready')

  // Whatever happens to this sheet, never leave a half-finished login connection behind.
  useEffect(
    () => () => {
      if (flowRef.current) void call('login:cancel', flowRef.current).catch(() => undefined)
    },
    []
  )

  const [qrImage, setQrImage] = useState('')
  const [qrAttempt, setQrAttempt] = useState(0)
  const isQr = step.name === 'qr'

  // The QR flow is event-driven: the code rotates, and the result arrives asynchronously.
  useEffect(() => {
    if (!isQr) return
    let disposed = false
    setQrImage('')
    call('login:qr-start')
      .then((flowId) => {
        if (disposed) void call('login:cancel', flowId).catch(() => undefined)
        else flowRef.current = flowId
      })
      .catch((failure: unknown) => !disposed && setError(messageOf(failure)))
    return () => {
      disposed = true
    }
  }, [isQr, qrAttempt])

  useEffect(
    () =>
      onLoginEvent((event) => {
        if (event.flowId !== flowRef.current) return
        switch (event.type) {
          case 'qr':
            void QRCode.toDataURL(event.url, { margin: 1, width: 440, errorCorrectionLevel: 'M' }).then(setQrImage)
            break
          case 'password':
            setBusy(false)
            setValue('')
            setStep({ name: 'password', flowId: event.flowId, hint: event.hint })
            break
          case 'done':
            flowRef.current = null
            select(event.accountId)
            onClose()
            break
          case 'error':
            setBusy(false)
            setError(event.message)
            if (event.fatal) flowRef.current = null
            break
        }
      }),
    [onClose, select]
  )

  const go = (next: Step): void => {
    setError('')
    setValue('')
    setStep(next)
  }

  const finish = (accountId: string | null): void => {
    flowRef.current = null
    if (accountId) select(accountId)
    onClose()
  }

  const back = (): void => {
    if (flowRef.current) void call('login:cancel', flowRef.current).catch(() => undefined)
    flowRef.current = null
    setBusy(false)
    go({ name: 'choose' })
  }

  /** Runs one step of a flow with shared busy/error handling. */
  const attempt = async (task: () => Promise<void | 'pending'>): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      // 'pending': the outcome will arrive as a login event, which clears the busy state.
      if ((await task()) !== 'pending') setBusy(false)
    } catch (failure) {
      setError(messageOf(failure))
      setBusy(false)
    }
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const input = value.trim()
    if (!input) return
    void attempt(async () => {
      switch (step.name) {
        case 'phone': {
          const started = await call('login:phone-start', input)
          flowRef.current = started.flowId
          go({ name: 'code', flowId: started.flowId, phone: input, via: started.via, length: started.length })
          break
        }
        case 'code': {
          const result = await call('login:submit-code', step.flowId, input)
          if (result.status === 'done') finish(result.accountId)
          else go({ name: 'password', flowId: step.flowId, hint: result.hint })
          break
        }
        case 'password': {
          const accountId = await call('login:submit-password', step.flowId, value)
          if (accountId) finish(accountId)
          else return 'pending'
          break
        }
        case 'session':
          finish(await call('login:import-session', input))
          break
      }
      return undefined
    })
  }

  const simple = (task: () => Promise<string | null>): void =>
    void attempt(async () => {
      const accountId = await task()
      if (accountId) finish(accountId)
    })

  const a = t().add

  const form = (content: ReactNode, action: string): ReactElement => (
    <form className="flow" onSubmit={submit}>
      {content}
      <ErrorText>{error}</ErrorText>
      <Button variant="primary" type="submit" busy={busy} disabled={!value.trim()}>
        {action}
      </Button>
    </form>
  )

  return (
    <Sheet title={a.titles[step.name]} onClose={onClose} onBack={step.name === 'choose' ? undefined : back} width={440}>
      {step.name === 'choose' ? (
        <div className="methods">
          <Method icon={<PhoneIcon />} title={a.phoneTitle} text={a.phoneText} onClick={() => go({ name: 'phone' })} />
          <Method icon={<QrIcon />} title={a.qrTitle} text={a.qrText} onClick={() => go({ name: 'qr' })} />
          <Method
            icon={<WindowIcon />}
            title={a.desktopTitle}
            text={runtimeReady ? a.desktopText : a.desktopNeedsRuntime}
            disabled={!runtimeReady || busy}
            onClick={() => simple(() => call('accounts:create-empty'))}
          />
          <Method icon={<FolderIcon />} title={a.tdataTitle} text={a.tdataText} disabled={busy} onClick={() => simple(() => call('accounts:import-tdata'))} />
          <Method icon={<KeyIcon />} title={a.sessionTitle} text={a.sessionText} onClick={() => go({ name: 'session' })} />
          <ErrorText>{error}</ErrorText>
        </div>
      ) : null}

      {step.name === 'phone'
        ? form(
            <>
              <p className="flow-text">{a.phonePrompt}</p>
              <TextField autoFocus type="tel" placeholder={a.phonePlaceholder} value={value} disabled={busy} onChange={(e) => setValue(e.target.value)} />
            </>,
            a.getCode
          )
        : null}

      {step.name === 'code'
        ? form(
            <>
              <p className="flow-text">
                {step.via === 'app' ? a.codeViaApp : step.via === 'sms' ? a.codeViaSms : a.codeViaOther} {a.number(step.phone)}
              </p>
              <TextField
                autoFocus
                inputMode="numeric"
                className="field-code"
                placeholder={'•'.repeat(step.length ?? 5)}
                maxLength={step.length ?? 8}
                value={value}
                disabled={busy}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
              />
              <button
                type="button"
                className="link"
                disabled={busy}
                onClick={() =>
                  void attempt(async () => {
                    const again = await call('login:resend-code', step.flowId)
                    setStep({ ...step, via: again.via, length: again.length })
                  })
                }
              >
                {a.resend}
              </button>
            </>,
            a.next
          )
        : null}

      {step.name === 'password'
        ? form(
            <>
              <p className="flow-text">
                {a.passwordPrompt}
                {step.hint ? ` ${a.hint(step.hint)}` : ''}
              </p>
              <TextField autoFocus type="password" placeholder={a.passwordPlaceholder} value={value} disabled={busy} onChange={(e) => setValue(e.target.value)} />
            </>,
            a.signIn
          )
        : null}

      {step.name === 'qr' ? (
        <div className="flow flow-center">
          <div className="qr">
            {qrImage && !error ? <img src={qrImage} alt={a.qrAlt} draggable={false} /> : error ? null : <Spinner />}
          </div>
          {error ? (
            <>
              <ErrorText>{error}</ErrorText>
              <Button
                onClick={() => {
                  setError('')
                  setQrAttempt((n) => n + 1)
                }}
              >
                {a.tryAgain}
              </Button>
            </>
          ) : (
            <ol className="steps">
              {a.qrSteps.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {step.name === 'session'
        ? form(
            <>
              <p className="flow-text">{a.sessionPrompt}</p>
              <textarea className="field textarea mono" rows={4} autoFocus value={value} disabled={busy} spellCheck={false} onChange={(e) => setValue(e.target.value)} />
            </>,
            a.import
          )
        : null}
    </Sheet>
  )
}
