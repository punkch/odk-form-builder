# Skills & Conventions for Central draft import

## Repo hard invariants (CLAUDE.md)

- **Pure-TS core** — `src/core/central/*` stays free of Vue/Pinia/Dexie/i18n;
  the client/import changes are pure and injectable-fetch tested.
- **i18n key parity** — every en key change lands in fr/es in the same edit
  (`MessageSchema = typeof en`, vue-tsc gate). Renamed key:
  `central.import.publishedOnly` → `draftNote`.
- **Byte-stable rendered English** — `noForms` and the picker note are
  *deliberate* copy changes; grep confirmed no unit/e2e test asserts either
  string. No `Issue` messages touched.
- **Preserve `data-testid`s** — `central-form-select`,
  `library-central-*` all unchanged.
- **Conventional commits**, one commit for the feature, after user
  confirmation.

## Delivery workflow (user global CLAUDE.md)

- Spec folder first (this folder), implementation next,
  `/unops-toolkit:code-review` on the diff (no plan mode), UI pass via
  agent-browser + interface-craft, docs (CLAUDE.md code map) updated in the
  same change.
