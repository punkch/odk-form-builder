# Lighthouse performance fix — kill the render-blocking 4.8 MB chunk, slim the critical path

## Context

Lighthouse against the deployed app (https://punkch.github.io/form-forge/, 2026-07-27):

| | Performance | FCP | LCP | TBT | CLS | Initial transfer |
|---|---|---|---|---|---|---|
| **Mobile (deployed)** | **54** | 11.6 s | 12.0 s | 160 ms | 0 | 2.2 MB gz |
| **Desktop (deployed)** | **79** | 2.0 s | 2.1 s | 30 ms | 0 | — |

Accessibility 100, Best-practices 100, SEO 90 (missing meta description). TBT/CLS are fine — the score is purely a **payload problem**.

**Root cause (verified experimentally):** `vite.config.ts`'s `manualChunks (id) { if (id.includes('@getodk')) return 'odk-web-forms' }` was written to keep the ~5 MB `@getodk/web-forms` out of the entry. Under Vite 8 (rolldown), that grouping instead **pulls Vue itself into the odk-web-forms chunk** (the chunk exports `createApp`/`ref`/…), so the entry *statically* imports the 4.8 MB chunk and `index.html` `modulepreload`s it → 1.6 MB gz of preview engine downloads before first paint. It also collapses web-forms' own internal code-splitting (934 K MapBlock, lazy locale files) into one blob.

**Proof-of-concept (already built and measured):** removing `manualChunks` and rebuilding → entry no longer touches web-forms; Vue gets its own chunk; web-forms splits back into lazy chunks loaded only when the preview mounts. Identical local Lighthouse mobile passes (both builds served via `npx serve`):

| | Perf | FCP | Initial transfer |
|---|---|---|---|
| current config | 50 | 12.1 s | 2.1 MB |
| without manualChunks | **67** | **4.8 s** | **630 KB** |

All `@getodk` imports in src are already dynamic (`webFormsLoader.ts`, `PreviewPanel.vue`, `FullPreviewView.vue`), so nothing else keeps it eager — the config rule is the sole cause.

**Remaining critical path after that fix (~630 KB)** — traced to three static chains:
1. `App.vue → src/pwa/registerSW.ts:5 → useFormStore` → whole editor core (validate 373 K, serializer, expr/symbol-table, question-types, forms/attachments repos, Dexie) lands in the **entry** chunk. (`updatePolicy.ts` only imports the *type* — free; the value import in registerSW is the leak.)
2. `App.vue → UnlockVaultDialog → central store/vault → db + WebCrypto` — eager for a dialog almost never shown at boot.
3. `src/i18n/index.ts` eagerly bundles all three locale catalogs (en+fr+es, 284 K raw / 92 K gz) though only one is active.
Additionally the landing route chunk (`FormLibraryView → AppHeader → SaveIndicator → useFormStore`) re-drags the editor core into the first-paint path even with a clean entry.

User approved scope: **chunking fix + critical-path slimming** (target mobile ~75–85).

Deliberately out of scope (documented as won't-fix in the spec): GH Pages cache headers (`max-age=600`, not configurable; hashed assets + SW precache already cover repeat visits), bf-cache failure, source maps, the 8 MB PWA precache (offline preview is the product's point).

## Task 1: Save spec documentation

Create `docs/specs/2026-07-27-<HHMM>-lighthouse-performance/` per the shape-spec layout:
- `plan.md` — this plan **in full**
- `shape.md` — scope, the measured before/after tables above, the root-cause narrative, won't-fix list
- `standards.md` — applicable repo invariants (pins with reasons, `data-testid` preservation, byte-stable en strings, conventional commits, CLAUDE.md maintenance)
- `references.md` — pointers: `vite.config.ts`, `src/pwa/registerSW.ts`, `src/i18n/{index,setLocale}.ts`, `src/components/shell/{AppHeader,SaveIndicator}.vue`, `src/preview/webFormsLoader.ts`, `scripts/a11y-audit.mjs` (pattern for the new gate script), `.github/ci.yml`
- `user-guide.md` — how to run the Lighthouse check + bundle-budget gate locally; what a user should observe (app paints fast before the preview engine loads in the background)

## Task 2: Chunking fix (the big win)

`vite.config.ts`:
- Delete the `rollupOptions.output.manualChunks` block. Replace its comment: web-forms is only ever *dynamically* imported (`src/preview/webFormsLoader.ts`), so rolldown naturally emits it as lazy chunks; a manual `id.includes('@getodk')` group under rolldown swallows shared deps (Vue) and turns the chunk render-blocking — never reintroduce it.
- Update the workbox comment (chunk is now split; largest piece ~2.2 MB raw — the 8 MB `maximumFileSizeToCacheInBytes` still comfortably covers it).

Verify after `pnpm build`: `dist/index.html` has no `modulepreload` of any chunk containing web-forms; entry's static import set contains no multi-MB chunk; preview still loads (e2e covers it).

Also clean up my investigation artifacts: delete `vite.config.perf-test.ts` and `dist-perf-test/`, kill the two `npx serve` processes on :4198/:4199.

## Task 3: Entry-graph slimming

- `src/pwa/registerSW.ts` — drop the top-level `import { useFormStore }`; obtain it lazily at decision time (`const { useFormStore } = await import('@/stores/form')` inside the update-decision path, or pass a `getSaveState` thunk into `decide`). `updatePolicy.ts`'s `import type { SaveState }` stays.
- `src/App.vue` — load `UnlockVaultDialog` via `defineAsyncComponent` so central store/vault/db leave the entry.
- `src/components/shell/AppHeader.vue` — remove the module-level `useFormStore` import from the landing chunk's graph: move the `form.saveState` read inside `SaveIndicator` (it already imports the form store) and make `SaveIndicator` a `defineAsyncComponent` in AppHeader (or equivalent decoupling). Check AppHeader's other `form.*` usages during implementation and treat them the same way. Goal: the `FormLibraryView` chunk's static graph contains no `core/validate`, no serializer, no question-types.
- Preserve all `data-testid`s and rendered strings; async components must not introduce layout shift (CLS is currently 0 — keep it; SaveIndicator/UnlockVaultDialog render nothing or fixed-size chrome initially).

## Task 4: Lazy fr/es locale catalogs

- `src/i18n/index.ts` — register only `en` eagerly (en stays the byte-stable source of truth and the `MessageSchema` anchor; fr/es modules keep their `satisfies MessageSchema` compile-time guarantee untouched).
- `src/i18n/setLocale.ts` — become async: for non-en locales, `await import('./locales/<l>')` + `i18n.global.setLocaleMessage` before switching; memoize loaded locales. Keep the lang/dir/PrimeVue-locale side effects.
- Callers (5): `main.ts:107` (await during boot so a stored/detected fr/es pref paints in the right language — main's boot path is already async), `stores/embed.ts:33`, `views/SettingsView.vue:111`, `components/importexport/WorkspaceArchiveDialog.vue:143` (`void setLocale(...)` where awaiting is impossible), plus re-check `stores/ui.ts` comment.
- eslint no-floating-promises / i18n rules must stay green; fr plural rule wiring must survive (it's registered at `createI18n` — keep it there, it's tiny).

## Task 5: Small audit fixes

- Add `<meta name="description" …>` to `index.html` (SEO 90 → 100). One sentence matching the README's product description.

## Task 6: Regression gate — bundle budget in CI

New `scripts/check-bundle-budget.mjs` (node, no deps — mirror the style of existing `scripts/*.mjs`):
1. Parse `dist/index.html` `modulepreload`/entry script hrefs.
2. Fail if any preloaded asset contains the web-forms marker (e.g. the string `OdkWebForm`) — the "preview engine must stay lazy" invariant, exact mechanism-agnostic.
3. Fail if total preloaded raw JS exceeds a budget set ~15 % above the post-fix measured baseline (measure during implementation, then pin).
Add `"check:bundle": "node scripts/check-bundle-budget.mjs"` to package.json and run it in `.github/ci.yml`'s e2e job right after its existing build step (the job that already builds dist).

## Task 7: Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` (e2e proves the preview, language switching and editor flows still work against the rebuilt app).
- `pnpm build` + serve `dist` locally + Lighthouse mobile run (same flags as the audit: `--max-wait-for-fcp=45000`, headless Chrome) — record before/after in `docs/verification/` per the repo's delivery process. Success: performance ≥ 75 mobile locally, no odk chunk preloaded, CLS still 0.
- `pnpm audit:a11y --url http://localhost:<port>` quick pass — async components must not regress the axe sweep.
- Run `/unops-toolkit:code-review` on the diff (no plan mode), apply verified findings; the diff touches UI wiring (App.vue, AppHeader, locale switching), so also do an agent-browser smoke of library → editor → preview → Settings language switch with screenshots, and fold findings in.

## Task 8: Docs upkeep (same change)

- `CLAUDE.md`: Commands (add `check:bundle`), a new hard invariant — "`@getodk/web-forms` must never be statically reachable from the entry / landing chunks; CI budget gate `scripts/check-bundle-budget.mjs` enforces it; no `manualChunks` for it (rolldown grouping hazard)", i18n note (fr/es lazy-loaded, `setLocale` async), pwa note (registerSW lazy form-store).
- `docs/product/roadmap.md` known follow-ups: note the deliberate won't-fix items (Pages cache headers, bf-cache).

## Task 9: Commit

Conventional commits after user confirmation, e.g. `perf(build): keep odk-web-forms out of the critical path — drop broken manualChunks, slim entry graph, lazy locales, CI bundle budget`. No co-author trailers.

## Execution shape

Per the standing Workflow opt-in: Tasks 3/4/5/6 are independent file sets — fan out as parallel implementation agents (`model: 'sonnet'`; Task 5 `'haiku'`) after Task 2 lands on main working tree; Tasks 1/2/7/8 run in the session (orchestration, config, verification). Overlap warning for agents: both Task 3 and Task 4 touch `main.ts`'s boot sequence — Task 4 owns `main.ts`, Task 3 must not edit it.
