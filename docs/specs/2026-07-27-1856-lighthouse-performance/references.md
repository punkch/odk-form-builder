# References for the Lighthouse performance fix

## Files at the center of the change

### `vite.config.ts`
- **Relevance:** hosts the broken `manualChunks` rule (root cause) and the
  workbox precache comment that references the old single-chunk layout.

### `src/pwa/registerSW.ts` (+ `src/pwa/updatePolicy.ts`)
- **Relevance:** the top-level `import { useFormStore }` is the entry-chunk
  leak; `updatePolicy.ts` already shows the right pattern (`import type
  { SaveState }` — types are free).

### `src/i18n/index.ts`, `src/i18n/setLocale.ts`
- **Relevance:** eager three-locale bundle; `setLocale` is the single locale
  entry point (5 callers: `main.ts`, `stores/embed.ts`,
  `views/SettingsView.vue`, `components/importexport/WorkspaceArchiveDialog.vue`)
  and becomes async.

### `src/components/shell/AppHeader.vue`, `src/components/shell/SaveIndicator.vue`
- **Relevance:** the landing-chunk leak (`AppHeader` value-imports the form
  store and passes `form.saveState` into `SaveIndicator`).

### `src/App.vue`
- **Relevance:** statically mounts `UnlockVaultDialog` (central store + vault
  crypto + Dexie eager).

## Patterns to borrow

### `src/preview/webFormsLoader.ts`
- Lazy, memoized dynamic-import loader — the model for keeping heavy deps out
  of the static graph (and proof that web-forms needs no manual chunk).

### `src/main.ts` embed branch (lines ~80–92)
- Existing dynamic-import style for boot-path-optional modules
  (`@/embed/bridge`, `@/persistence/memory-backend`,
  `@/persistence/migrate-legacy-db`).

### `scripts/a11y-audit.mjs`, `scripts/generate-theme-css.mjs`
- House style for standalone node scripts (arg parsing, exit codes) —
  template for `scripts/check-bundle-budget.mjs`.

### `.github/ci.yml` e2e job
- Already builds `dist` for playwright; the bundle-budget gate hooks in right
  after that build step.

## Evidence trail

- Lighthouse runs (mobile deployed / desktop deployed / local A/B) executed
  2026-07-27; numbers recorded in `shape.md` and `docs/verification/`.
- Built-chunk forensics: `dist/assets/odk-web-forms-*.js` exported
  `createApp`/`ref`/`vue_runtime_esm_bundler_exports` and was statically
  imported by the entry — the smoking gun for the rolldown grouping hazard.
