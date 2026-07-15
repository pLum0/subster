import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { en, type Dict } from './en'
import { de } from './de'

/**
 * Language registry. Adding a language = create `xx.ts` implementing `Dict`
 * (the compiler enforces completeness), then add it here.
 */
export const LOCALES: Record<string, Dict> = { en, de }

export const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
]

/** Pick a starting language from the device locale, falling back to English. */
function detectLocale(): string {
  const lang = (globalThis.navigator?.language ?? 'en').slice(0, 2).toLowerCase()
  return LOCALES[lang] ? lang : 'en'
}

interface LocaleState {
  locale: string
  setLocale: (locale: string) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: detectLocale(),
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'subster.locale' },
  ),
)

// Keep <html lang> in sync so screen readers pick the right voice.
function applyLang(locale: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}
applyLang(useLocaleStore.getState().locale)
useLocaleStore.subscribe((s) => applyLang(s.locale))

/** Hook returning the current language's dictionary. */
export function useT(): Dict {
  const locale = useLocaleStore((s) => s.locale)
  return LOCALES[locale] ?? en
}
