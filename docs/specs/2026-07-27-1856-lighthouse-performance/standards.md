# Skills & Conventions for the Lighthouse performance fix

## Repo hard invariants that constrain this work (CLAUDE.md)

- **Version pins with reasons** — no dependency changes here; the fix is
  config/wiring only. Vite stays `^8`, `@getodk/web-forms` 1.0.0 untouched.
- **Preserve `data-testid`s** — async-component wrappers (SaveIndicator,
  UnlockVaultDialog) must keep every existing testid reachable once mounted.
- **UI strings only via vue-i18n; keep rendered English byte-stable** — the
  lazy-locale refactor must not change any en string; fr/es keep their
  `satisfies MessageSchema` compile guarantee.
- **`src/core/` purity** — untouched by this work; the changes live in app
  wiring (pwa, i18n, shell components) and build config.
- **Conventional commits**, release-please on `main`, no co-author trailers
  (user's global instruction).
- **CLAUDE.md maintenance** — new `check:bundle` command, the new
  "web-forms must stay lazy" invariant, and i18n/pwa notes land in the same
  change.

## Delivery process

Shape-spec folder (this one) → implementation via dynamic Workflow with
parallel sonnet/haiku agents → full verification (lint, typecheck, unit,
e2e, a11y audit, Lighthouse re-measure recorded in `docs/verification/`) →
`/unops-toolkit:code-review` on the diff + agent-browser smoke (UI wiring is
touched) → conventional commit after user confirmation.

## New convention introduced by this work

**Bundle budget gate:** `scripts/check-bundle-budget.mjs` runs in CI after the
build. It fails if (a) any `modulepreload`ed/entry asset contains the
`OdkWebForm` marker (the preview engine must never be render-blocking), or
(b) the total preloaded raw JS exceeds the pinned budget (~15 % above the
post-fix baseline). Raising the budget number is a deliberate act to be done
in the same PR as whatever grows the critical path.
