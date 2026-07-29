# Lighthouse performance fix — User guide & manual test scenarios

## What changed for users

- The app paints its first screen in a fraction of the previous time on slow
  connections (mobile FCP ~12 s → target ≤ 5 s). The ~5 MB ODK preview engine
  now downloads only when a form preview actually renders, not before first
  paint.
- French/Spanish translations load on demand the first time you switch to
  them (imperceptible on normal connections); English is built in.
- Nothing else is visibly different: same screens, same offline/PWA behavior
  (the service worker still precaches everything for offline use in the
  background).

## Checking performance locally

```bash
pnpm build
npx serve -n -s dist -l 4173         # any static server with gzip
npx lighthouse http://localhost:4173/ \
  --max-wait-for-fcp=45000 \
  --chrome-flags="--headless=new"
```

Expect: performance ≥ 75 (mobile emulation), FCP well under 5 s, and no
`modulepreload` of a web-forms chunk in `dist/index.html`.

## Bundle budget gate

```bash
pnpm build && pnpm check:bundle
```

Fails when the preview engine becomes render-blocking again or the preloaded
JS total exceeds the pinned budget. CI runs it after every build (e2e job).
If you legitimately grow the critical path, raise the budget constant in
`scripts/check-bundle-budget.mjs` in the same PR and say why.

## Manual test scenarios

1. **Cold load** — open the deployed app in a private window: library renders;
   DevTools Network shows no multi-MB JS before first paint.
2. **Preview still works** — open a form, check the live preview panel and the
   full-page preview; the web-forms chunks appear in Network only at this
   point.
3. **Language switch** — Settings → Interface language → Français / Español:
   UI switches fully (first switch fetches the catalog); reload keeps the
   choice; switching back to English works offline.
4. **Vault dialog** — with a Central server + saved password configured, the
   unlock dialog still appears and unlocks (it is now lazy-mounted).
5. **PWA update flow** — with an old SW active, deploy a new version: the
   update toast still appears mid-edit and auto-reloads when idle.
6. **Offline** — after one full visit, go offline and reload: app + preview
   still work (precache unaffected).
