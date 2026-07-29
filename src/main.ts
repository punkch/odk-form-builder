import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import 'primeicons/primeicons.css'
import '@/styles/odk-tokens.css'
import '@/styles/builder.css'
import '@/styles/motion.css'
// Theming overrides. Vite-owned stylesheets keyed on :root[data-ff-theme|accent|contrast]
// (specificity 0,2,0, or 0,3,0+ for the compound contrast blocks) so they beat
// both PrimeVue runtimes' plain :root (0,1,0) injections and survive the
// preview child rewriting the shared PrimeVue styles. builder-contrast.css
// MUST stay after theme-accents-aa.css: its 0,3,0 accent-alias redirect wins
// that specificity tie only by source order (see the comment on that rule).
import '@/styles/generated/theme-dark.css'
import '@/styles/generated/theme-accents.css'
import '@/styles/generated/theme-accents-aa.css'
import '@/styles/generated/theme-contrast-accents.css'
import '@/styles/builder-dark.css'
import '@/styles/builder-contrast.css'

import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { createApp } from 'vue'

import App from '@/App.vue'
import { embedDetection } from '@/embed/detect'
import { i18n, SUPPORTED_LOCALES } from '@/i18n'
import { detectPreferredLocale } from '@/i18n/detectLocale'
import { primeVueLocaleFor, registerPrimeVueConfig } from '@/i18n/primevue-locale'
import { setLocale } from '@/i18n/setLocale'
import { setPersistenceBackend } from '@/persistence/backend'
import { router } from '@/router'
import { useEmbedStore } from '@/stores/embed'
import { useUiStore } from '@/stores/ui'
import { odkPreset } from '@/styles/odk-preset'
import { initThemeController } from '@/theme'

// Embed detection runs before anything mounts: the memory backend must be in
// place before any store touches persistence (the host owns durability unless
// init asks for 'local'), and 'ready' must be posted as soon as the bridge
// listens. The bridge, protocol and memory backend are dynamically imported
// only in the embed branch, so a normal session never parses them.
const embed = embedDetection()

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(i18n)
// Read here (rather than where the rest of the persisted-locale handling
// lives, below) because it has to be available before installing PrimeVue,
// so the very first render already has the right `config.locale.aria`
// strings instead of a flash of English ones. The ui store persists to
// localStorage only, so this is safe before persistence-backend/embed setup.
const ui = useUiStore(pinia)
// Same preset/options as the PrimeVue bundled inside @getodk/web-forms, so
// the duplicate :root token injection is idempotent. Deliberately NO cssLayer:
// web-forms' runtime CSS is unlayered and would win over layered host tokens.
app.use(PrimeVue, {
  theme: {
    preset: odkPreset,
    options: { darkModeSelector: false },
  },
  locale: primeVueLocaleFor(ui.locale),
})
// Hands setLocale a live reference to PrimeVue's reactive config so later
// switches (Settings language picker, workspace-backup restore) also update
// built-in controls' accessible names (Dialog/Drawer close buttons, etc).
registerPrimeVueConfig(app.config.globalProperties.$primevue.config)
app.use(ConfirmationService)
app.use(ToastService)
app.directive('tooltip', Tooltip)

if (embed.active) {
  const [{ startEmbedBridge }, { createMemoryBackend }] = await Promise.all([
    import('@/embed/bridge'),
    import('@/persistence/memory-backend'),
  ])
  setPersistenceBackend(createMemoryBackend())
  const embedStore = useEmbedStore(pinia)
  embedStore.active = true
  embedStore.hostOrigin = embed.origin
  startEmbedBridge({ router, pinia })
} else {
  // The Dexie backend is a lazy chunk (keeps IndexedDB plumbing out of the
  // render-blocking entry — see the critical-path invariant in CLAUDE.md);
  // install it before any store touches persistence. Then the one-time rename
  // of the workspace IndexedDB (odk-form-builder → form-forge), which must run
  // before any store opens the renamed database. Embed sessions never touch
  // Dexie (memory backend above), so this is the local path only.
  const [{ dexieBackend }, { migrateLegacyDb }] = await Promise.all([
    import('@/persistence/dexie-backend'),
    import('@/persistence/migrate-legacy-db'),
  ])
  setPersistenceBackend(dexieBackend)
  await migrateLegacyDb()
}

// Apply the persisted UI language (and <html lang dir>) before first paint.
// First-run only (non-embed, no locale preference ever stored): best-match
// navigator.language against the app's known locales (SUPPORTED_LOCALES, not
// `i18n.global.availableLocales` — fr/es ship as lazy chunks now and aren't
// registered yet at this point) so a fresh session doesn't default to English
// for a francophone/hispanophone visitor. Any stored preference (Settings
// choice, or a restored workspace-backup preference) always wins from then
// on. (`ui` itself was already read above, before installing PrimeVue.)
if (!embed.active && !ui.localeWasStored) {
  const detected = detectPreferredLocale(navigator.language, Object.keys(SUPPORTED_LOCALES), ui.locale)
  if (detected !== ui.locale) ui.locale = detected
}
// Awaited so a detected/stored fr/es preference paints in the right language
// on first render instead of flashing English while its catalog chunk loads.
// A failed catalog fetch (offline first paint, or a stale index.html naming a
// gone chunk hash after a redeploy) must degrade to English — a rejection
// here would abort the whole module and leave a blank page.
await setLocale(ui.locale).catch(() => {})
// Apply the persisted theme/accent and start tracking OS scheme + preference
// changes. The inline no-FOUC script already stamped the attributes; this keeps
// them in sync reactively (and lets an embed host override them).
initThemeController(ui)

app.mount('#app')
