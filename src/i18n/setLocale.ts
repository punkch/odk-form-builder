import type { AppLocale, MessageSchema } from './index'
import { i18n } from './index'
import { applyPrimeVueLocale } from './primevue-locale'

const textDirection = (locale: string): 'rtl' | 'ltr' =>
  locale.startsWith('ar') ? 'rtl' : 'ltr'

/**
 * Dynamic loaders for the non-English catalogs, one static `import()` literal
 * per locale — a computed `import(`./locales/${locale}`)` would make rolldown
 * bundle every locale into a single chunk, defeating the point. Each entry
 * resolves straight to its `MessageSchema`, so a hit here only ever needs one
 * `setLocaleMessage` call. English ships in the main bundle (see
 * `src/i18n/index.ts`) and is never in this map.
 */
const LOCALE_LOADERS: Record<Exclude<AppLocale, 'en'>, () => Promise<MessageSchema>> = {
  fr: () => import('./locales/fr').then((m) => m.fr),
  es: () => import('./locales/es').then((m) => m.es),
}

const needsCatalog = (locale: string): locale is Exclude<AppLocale, 'en'> =>
  locale in LOCALE_LOADERS

/**
 * Monotonic switch counter: `setLocale` awaits a catalog fetch, so two rapid
 * calls (fr then es) can resolve out of order — without this guard the
 * slower-loading earlier choice would apply last and win over the user's
 * actual latest pick.
 */
let switchSeq = 0

/**
 * Switches the active UI locale and keeps the document element in sync
 * (`lang` for assistive tech / font selection, `dir` for RTL locales such as
 * Arabic). Non-English catalogs are lazy — fetched via `LOCALE_LOADERS` on
 * first use only, so a session that never switches away from English never
 * downloads fr/es. `i18n.global.availableLocales` doubles as the memo: once a
 * catalog is registered (here, or by a test via `setLocaleMessage`), it's
 * never re-fetched. The catalog is registered BEFORE the active locale is
 * switched, so the very first render in the new language already has its
 * strings. Also re-applies PrimeVue's own locale (`config.locale.aria`) so
 * built-in controls' accessible names — Dialog/Drawer close buttons and the
 * like — follow the same switch, including for whatever is already open
 * (PrimeVue's config is reactive).
 */
export const setLocale = async (locale: string): Promise<void> => {
  const seq = ++switchSeq
  if (needsCatalog(locale) && !i18n.global.availableLocales.includes(locale)) {
    const messages = await LOCALE_LOADERS[locale]()
    // Register even when superseded — the catalog is in memory now, so a
    // later switch back hits the memo instead of re-fetching.
    i18n.global.setLocaleMessage(locale, messages)
  }
  if (seq !== switchSeq) return
  i18n.global.locale.value = locale as typeof i18n.global.locale.value
  document.documentElement.lang = locale
  document.documentElement.dir = textDirection(locale)
  applyPrimeVueLocale(locale)
}
