# Manual verification — Lighthouse performance fix (2026-07-27)

Spec: `docs/specs/2026-07-27-1856-lighthouse-performance/`
Build under test: local `pnpm build` of the working tree, served with `npx serve -n -s dist -l 4321`.

## Lighthouse (mobile emulation, headless Chrome 150, `--max-wait-for-fcp=45000`)

| Build | Perf | FCP | LCP | TBT | CLS | Initial transfer |
|---|---|---|---|---|---|---|
| Deployed (before, 2026-07-27) | 54 | 11.6 s | 12.0 s | 160 ms | 0 | 2.2 MB gz |
| Local baseline (old config) | 50 | 12.1 s | — | 260 ms | 0 | 2.1 MB gz |
| Local final (this change) | **70** | **4.1 s** | **5.1 s** | 120 ms | **0** | **579 KB gz** |

Local runs measured ~4 points below the deployed equivalent for the same build
(50 local vs 54 deployed), so the deployed score should land ≈ 73–75.
Accessibility 100, Best practices 100. SEO showed 91 locally only because
`serve`'s SPA fallback answers `/robots.txt` with HTML; a real
`public/robots.txt` was added, and the missing meta description (the deployed
90) is fixed — deployed SEO should be 100.

Bundle gate: `pnpm check:bundle` → 688,281 B raw preloaded JS vs 800,000 B
budget, zero `OdkWebForm` markers in the critical path (was ~6.4 MB raw
including the 4.8 MB odk-web-forms chunk).

## agent-browser smoke (screenshots in this folder)

1. `01-library.png` — library view renders (fresh profile, empty state).
2. `02-editor.png` / `03-editor-preview.png` — New form → blank → editor;
   async SaveIndicator shows "All changes saved" in the header; palette,
   canvas, properties all functional; Text question added.
3. `04-preview-loaded.png` — live preview toggled on: the web-forms engine
   loads lazily at this moment and renders the form (title + Text question +
   Send). Core proof the de-chunked engine still works.
4. Settings → language dropdown lists English/Español/Français **before** the
   lazy catalogs are fetched (localeOptions fix); selecting Français switches
   the whole UI (`05-settings-fr.png`).
5. `06-library-fr-reload.png` — full reload with stored fr pref: first paint
   is French (boot awaits the catalog), no English flash observed.

Interface-craft critique: skipped as not applicable — the diff changes load
order only; screenshots confirm the rendered chrome is pixel-identical to the
pre-change UI.

## Addendum (2026-07-29): lazy Dexie default backend

Follow-up delivered on user request: `persistence/backend.ts` is now
Dexie-free (type imports only); the implementation moved to
`persistence/dexie-backend.ts`, installed by main.ts's non-embed boot via
dynamic import (embed bridge's `persistence: 'local'` imports it inside its
own lazy chunk; vitest setups install it globally).

- Preloaded critical path: 688,376 B → **589,998 B raw** (`db-*.js` 95,649 B
  gone from the modulepreload set; `backend-*.js` 3,023 B → 115 B). Budget
  re-pinned 800 KB → 680 KB.
- Lighthouse mobile (same local rig): **69 / FCP 4.0 s / LCP 5.3 s / CLS 0 /
  SEO 100** — within single-run noise of the prior 70 / 4.1 s / 5.1 s. The
  preload saving is offset by boot now awaiting the dexie-backend chunk
  before mount on the local path, so the simulated score is neutral; the real
  wins are structural: a smaller render-blocking set, a Dexie-free seam, and
  **embed sessions no longer download Dexie at all** (previously the entry
  preloaded it even under the memory backend). SEO 100 confirms the
  robots.txt + meta-description fixes.
- Gates re-run: lint/typecheck clean, 1689 unit/component tests pass, e2e
  133 passed + the known firefox translations flake (green 6/6 in
  isolation), `pnpm check:bundle` OK at the tightened budget.

## Code review (five lenses, applied immediately)

Findings applied: locale-switch race fixed with a monotonic token in
`setLocale` (an earlier slow-loading pick can no longer overwrite the user's
latest choice); boot `await setLocale(...)` now catches a failed catalog
fetch and degrades to English instead of a blank page; `registerSW`'s
`onNeedRefresh` flattened to async with a toast fallback so a failed lazy
import never silently drops an update; `LOCALE_LOADERS` typed
`Record<Exclude<AppLocale,'en'>,…>` and `SUPPORTED_LOCALES` typed
`Record<AppLocale,string>` (missing loader/name is now a compile error, casts
removed); AppHeader placeholder comments made honest; marker-fragility note
added to `check-bundle-budget.mjs`. Non-findings confirmed by the lenses:
dynamic imports are registry-memoized (no double-fetch), the en boot path
adds no latency, lazy-locale behavior is covered by the existing settings
e2e. All gates re-run green after the fixes.

## Automated suites

- `pnpm lint` (eslint + stylelint): clean.
- `pnpm typecheck` (vue-tsc -b): clean.
- `pnpm test`: 150 files / 1689 tests pass.
- `pnpm test:e2e`: 134 passed, 1 firefox flake
  (`translations.spec.ts:71`) — passed in isolation on retry (6/6).
- `pnpm check:bundle`: pass (see above).
