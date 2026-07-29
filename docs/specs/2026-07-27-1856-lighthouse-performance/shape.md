# Lighthouse performance fix — Shaping Notes

## Scope

Fix the deployed app's Lighthouse performance score (mobile 54, desktop 79 on
2026-07-27). User-approved scope: **chunking fix + critical-path slimming**
(target mobile ~75–85). Not just the one-line chunking fix, not report-only.

## Measurements (2026-07-27, Lighthouse 12.x, headless Chrome 150)

Deployed https://punkch.github.io/form-forge/:

| | Performance | FCP | LCP | TBT | CLS | Initial transfer |
|---|---|---|---|---|---|---|
| Mobile | **54** | 11.6 s | 12.0 s | 160 ms | 0 | 2.2 MB gz |
| Desktop | **79** | 2.0 s | 2.1 s | 30 ms | 0 | — |

Accessibility 100, Best-practices 100, SEO 90 (missing meta description).
TBT/CLS are healthy — the score is purely a payload/critical-chain problem.

Local A/B (both builds served with `npx serve`, identical Lighthouse mobile flags):

| | Perf | FCP | Initial transfer |
|---|---|---|---|
| current config | 50 | 12.1 s | 2.1 MB |
| without `manualChunks` | **67** | **4.8 s** | **630 KB** |

## Root cause

`vite.config.ts`'s `manualChunks (id) { if (id.includes('@getodk')) return
'odk-web-forms' }` was written (pre-Vite-8) to keep the ~5 MB
`@getodk/web-forms` out of the entry chunk. Under Vite 8 (rolldown), that
grouping instead pulls **Vue itself** into the odk-web-forms chunk (verified:
the built chunk exports `createApp`/`ref`/`vue_runtime_esm_bundler_exports`),
so the entry *statically* imports the 4.8 MB chunk and `index.html`
`modulepreload`s it — 1.6 MB gz of preview engine downloads before first
paint. It also collapses web-forms' internal code-splitting (934 K MapBlock,
lazy locale strings) into one blob. All `@getodk` imports in `src/` are
already dynamic, so the config rule is the sole cause; removing it restores
true laziness.

## Secondary critical-path leaks (traced in the fixed build)

1. `App.vue → src/pwa/registerSW.ts → useFormStore` (value import) → entire
   editor core (validate 373 K raw, serializer, expr, question-types, repos,
   Dexie) in the **entry** chunk.
2. `App.vue → UnlockVaultDialog → central store/vault → db + WebCrypto` eager.
3. `src/i18n/index.ts` bundles all three locale catalogs eagerly (284 K raw /
   92 K gz) though one is active.
4. Landing chunk: `FormLibraryView → AppHeader → SaveIndicator → useFormStore`
   re-drags the editor core into the first-paint path.

## Decisions

- Drop `manualChunks` entirely; enforce laziness with a CI bundle-budget gate
  (`scripts/check-bundle-budget.mjs`) instead of chunk-naming config.
- Slim the entry and landing graphs (lazy form store in registerSW, async
  UnlockVaultDialog/SaveIndicator, lazy fr/es catalogs, async `setLocale`).
- Add the missing `<meta name="description">` (SEO 90 → 100).

## Addendum (2026-07-29): Dexie default backend made lazy

The one remaining shavable preload — Dexie reachable from the entry because
`persistence/backend.ts` value-imported `db` to define the default backend —
was delivered as a follow-up on user request. The seam is now Dexie-free
(type imports only); the implementation moved verbatim to
`persistence/dexie-backend.ts`, installed by main.ts's non-embed boot via
dynamic import (embed keeps the memory backend; the embed bridge's
`persistence: 'local'` switch imports it statically inside its own lazy
chunk). `getPersistenceBackend()` now throws until a backend is installed;
both vitest setups install the Dexie default globally so specs reach repos
directly, and the backend-contract helper still swaps per case. Preloaded
critical path: 688 KB → 590 KB raw; budget re-pinned 800 KB → 680 KB.

## Won't fix (deliberate)

- **GH Pages cache headers** (`max-age=600`) — not configurable on Pages;
  hashed asset filenames + the PWA service-worker precache already make
  repeat visits fully local.
- **bf-cache failure** — service-worker-related, low value for an SPA.
- **Source maps in production** — not worth the deploy weight.
- **8 MB PWA precache** — offline preview is the product's point; it is
  background work and does not affect first-paint metrics.

## Context

- **Visuals:** None (Lighthouse JSON/HTML reports kept out of git; numbers
  recorded above and in `docs/verification/`).
- **References:** see `references.md`.
- **Product alignment:** static-files-only, offline-first PWA constraints
  (docs/product/tech-stack.md) — all fixes are client/build-side; no CDN or
  server-header dependence.
