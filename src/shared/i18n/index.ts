/**
 * User-facing strings. Each process keeps its own current language: the main process
 * decides it from the settings, the renderer follows what arrives with the app state.
 */
import { en } from './en'
import { ru } from './ru'

export type Lang = 'ru' | 'en'
export type LanguagePreference = 'system' | Lang
export type Messages = typeof ru

const dictionaries: Record<Lang, Messages> = { ru, en }

/** Native names, shown untranslated so a language can be found from any other. */
export const LANGUAGE_NAMES: Record<Lang, string> = { ru: 'Русский', en: 'English' }

let current: Lang = 'en'

export const language = (): Lang => current

export function setLanguage(lang: Lang): void {
  current = lang
}

/** The dictionary of the current language. Call at use time; never cache the result. */
export const t = (): Messages => dictionaries[current]

export function resolveLanguage(preference: LanguagePreference, systemLocale: string): Lang {
  if (preference !== 'system') return preference
  return systemLocale.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}
