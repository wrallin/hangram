import { describe, expect, it } from 'vitest'
import { resolveLanguage, setLanguage, t } from '../src/shared/i18n'
import { en } from '../src/shared/i18n/en'
import { ru } from '../src/shared/i18n/ru'

describe('i18n', () => {
  it('translates the same Telegram error codes in every language', () => {
    // Plain records, so the type checker cannot catch a code missing from one of them.
    expect(Object.keys(en.telegramErrors).sort()).toEqual(Object.keys(ru.telegramErrors).sort())
  })

  it('follows the system locale unless a language is chosen', () => {
    expect(resolveLanguage('system', 'ru-RU')).toBe('ru')
    expect(resolveLanguage('system', 'de-DE')).toBe('en')
    expect(resolveLanguage('en', 'ru-RU')).toBe('en')
  })

  it('switches dictionaries and handles plurals', () => {
    setLanguage('ru')
    expect([1, 2, 5, 11, 21].map((n) => t().list.count(n))).toEqual([
      '1 аккаунт',
      '2 аккаунта',
      '5 аккаунтов',
      '11 аккаунтов',
      '21 аккаунт'
    ])
    setLanguage('en')
    expect([1, 2].map((n) => t().list.count(n))).toEqual(['1 account', '2 accounts'])
  })
})
