import { createI18n, useI18n } from 'vue-i18n'

import { en } from './locales/en'
import { frPluralRule } from './pluralRules'

/**
 * Shape of the UI message catalog. English is the source of truth; additional
 * locales must satisfy this schema so vue-tsc catches missing/bad keys.
 */
export type MessageSchema = typeof en

type NestedKey<T> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? `${K}.${NestedKey<T[K]>}`
    : K
}[keyof T & string]

/** Every dotted key path of the catalog: 'common.cancel' | 'common.save' | … */
export type MessageKey = NestedKey<MessageSchema>

/**
 * `t` restricted to catalog keys. vue-i18n 11 types its own `t`/`$t` keys as
 * autocomplete-only (`Key extends string` accepts any string), so this alias
 * is what makes an unknown key a vue-tsc error.
 */
export interface StrictTranslate {
  (key: MessageKey): string
  (key: MessageKey, plural: number): string
  (key: MessageKey, named: Record<string, unknown>): string
  (key: MessageKey, named: Record<string, unknown>, plural: number): string
}

/**
 * The locale union the app ships full catalogs for — the single source of
 * truth consumers must derive from (createI18n below, the PrimeVue aria map
 * in primevue-locale.ts), so adding a locale here breaks every site that
 * hasn't caught up yet instead of drifting silently.
 */
export type AppLocale = 'en' | 'fr' | 'es'

/**
 * UI-chrome i18n instance (Composition API mode). This is distinct from the
 * form-content translations feature (TranslationsDialog), which translates
 * the *forms being built*, not the builder itself.
 */
export const i18n = createI18n<{ message: MessageSchema }, AppLocale, false>({
  legacy: false,
  globalInjection: true,
  locale: 'en',
  fallbackLocale: 'en',
  // Only English ships eagerly; fr/es are fetched as separate lazy chunks and
  // registered via `setLocaleMessage` on first switch (see setLocale.ts). The
  // `AppLocale` union above forces `messages`'s declared type to require every
  // locale up front — this cast is the acknowledged escape hatch for that
  // (vue-i18n's own documented lazy-loading pattern), not a runtime lie:
  // `i18n.global.availableLocales` correctly reports only 'en' until a switch
  // registers more.
  messages: { en } as Record<AppLocale, MessageSchema>,
  pluralRules: { fr: frPluralRule },
})

/**
 * Native display names for the UI locales the app knows how to label. fr/es
 * catalogs are lazy-loaded on first switch (`setLocale`), so they're NOT
 * registered in `i18n.global.availableLocales` at boot — this map, not that
 * list, is what the picker's option codes come from now (see `localeOptions`).
 */
export const SUPPORTED_LOCALES: Record<AppLocale, string> = { en: 'English', fr: 'Français', es: 'Español' }

/**
 * Options for the app-language picker: every locale the app ships (always
 * offered, even before its catalog has been fetched) plus any catalog
 * registered ad hoc — e.g. a test's `i18n.global.setLocaleMessage` — labeled
 * by native name when known, else its raw code. Deduped and sorted so the
 * order stays stable regardless of load/registration order.
 */
export const localeOptions = (): { code: string, label: string }[] => {
  const codes = new Set<string>([...Object.keys(SUPPORTED_LOCALES), ...i18n.global.availableLocales])
  return [...codes].sort().map((code) => ({
    code,
    label: code in SUPPORTED_LOCALES ? SUPPORTED_LOCALES[code as AppLocale] : code,
  }))
}

/**
 * Preferred way to translate in components: `const { t } = useAppI18n()`.
 * Same global-scope composer as `useI18n()`, but `t` only accepts existing
 * catalog keys — including when called from templates, which vue-tsc checks
 * against setup bindings. (`$t` stays available but is guarded by ESLint
 * `no-missing-keys` only.)
 */
export const useAppI18n = (): { t: StrictTranslate } => {
  const { t } = useI18n<{ message: MessageSchema }, 'en'>({ useScope: 'global' })
  return { t: t as StrictTranslate }
}

/** Strict `t` for module/store code that runs outside a component setup. */
export const translate = i18n.global.t as StrictTranslate
