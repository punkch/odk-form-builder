# Central draft import — Shaping Notes

## Scope

The library Central drawer ("Import from Central") currently offers only
*published* forms (`publishedAt !== null`) and shows "This project has no
published forms" for a project that holds only never-published drafts — even
though `GET /v1/projects/:id/forms` returns those drafts. Observed live by the
user against Central-DEV (all forms `publishedAt: null`, non-null `draftToken`).

We now:

- **List every form** in the picker; a never-published form is labeled with a
  localized "(unpublished)" suffix (user's explicit ask).
- **Import never-published forms from their current draft** via Central's
  draft endpoints (`GET .../forms/:id/draft.xml`, `.../draft/attachments`,
  `.../draft/attachments/:name`).
- Published forms keep importing the *published* definition, exactly as today.

## Decisions

- **Published + newer draft ⇒ published wins.** A form with `publishedAt`
  set imports its published definition even if a newer draft exists on the
  server. Only *never-published* forms take the draft path. (Matches the
  user's phrasing: mark forms that were *never published*.)
- **Draft imports do NOT seed a publish target.** The published-import path
  seeds the origin as a tracked destination with
  `lastPublishedVersion`/`lastPublishedAt`/`lastPublishedContentHash` — all
  statements about a publish that happened. For a draft-only form no publish
  ever happened; seeding would fabricate a "last published" date/version and
  make the freshness chip claim "Up to date" while Check-server says
  never-published. `PublishTargetRecord` has no draft notion and adding one is
  out of scope. The user re-adds the destination on first real publish
  (NewDestinationForm pre-fills existing server forms).
- **Picker prop change:** `publishedOnly` is removed (its only consumer was
  the import drawer). The picker always lists all forms and decorates
  never-published ones. The publish-side `NewDestinationForm` picker gains the
  same suffix — informative and harmless there.
- **Selected-summary plumbing:** the drawer needs the *summary* (to branch
  published/draft), not just the `xmlFormId`. The picker gains a second model,
  `v-model:selected-form` (`CentralFormSummary | null`), kept in sync with
  `modelValue` (emitted on change, nulled on clear).
- **Copy changes** (en + fr + es, key parity enforced by vue-tsc):
  - `central.import.noForms` → "This project has no forms." (the list is no
    longer filtered, so the old "no published forms" would be wrong).
  - `central.import.publishedOnly` → **renamed** `central.import.draftNote`,
    reworded to explain that "(unpublished)" forms import their current draft.
  - new `central.import.unpublishedForm` = "{name} (unpublished)" — a full
    interpolation key so locales can move the marker.
- **Core seam:** `CentralImportInput` gains `source?: 'published' | 'draft'`
  (default `'published'` — existing callers/tests unchanged). Client gains the
  one missing draft accessor, `downloadDraftAttachment`.

## Context

- **Visuals:** user screenshot of the empty picker + the network response
  showing `publishedAt: null` forms (conversation, 2026-07-29; not archived —
  content fully described above).
- **References:** `src/core/central/{client,import,types}.ts`,
  `src/components/central/{CentralFormPicker,LibraryCentralDrawer}.vue`,
  `tests/component/import-from-central.spec.ts` (see references.md).
- **Product alignment:** Central integration is delivered Phase 3 work
  (roadmap); this closes a real-world import gap in it.

## Post-review deltas (2026-07-29, five-lens /code-review + interface-craft)

- `CentralImportSource` exported from `core/central/import.ts` — the
  `'published' | 'draft'` union has ONE definition site (store + drawer import
  the type).
- The import's definition + attachment-list reads run under `Promise.all`
  (independent requests; saves a round-trip on every import).
- `client.ts` gained an internal `form(projectId, xmlFormId)` path helper —
  the encoded form-path join now exists once.
- Drawer correctness hardening: Pull is gated on `canPull` (the picked id and
  the `selected-form` summary must agree — they settle a tick apart during a
  refetch), and the pull origin (`{serverId, projectId, xmlFormId, source}`)
  is captured into `pulledFrom` at pull time; `seedTarget` reads ONLY that, so
  changing pickers mid-pull can no longer seed a target against the wrong
  destination (and the draft-skip rides the same capture).
- Picker uses `defineModel('selectedForm')` (repo idiom) instead of a dead
  prop + manual emit.
- i18n final shape: the key is **`central.import.unpublishedTag`**
  ("(unpublished)" / "(non publié)" / "(sin publicar)") — labels compose
  `name + ' ' + tag`, and (interface-craft finding) the dropdown renders the
  tag muted+smaller via a `#option` slot while the full label remains the
  option's accessible name and the closed-combobox display. Straight quotes in
  the en `draftNote` (catalog convention); fr uses "l'importation".
- Copy sweep: `central.settings.description`, `central.import.intro` and the
  publish guide (summary + step 8) no longer claim published-only import.
- Consciously NOT taken: `coerceFormSummary` mapping malformed (non-string,
  non-null) `publishedAt` to `null` — Central's contract is string|null, the
  coercer's safe-default now means "offer draft import" instead of "hide";
  either default is a guess on garbage data, left as-is.

## Skills & Conventions Applied

- Repo hard invariants (CLAUDE.md): pure-TS core, i18n key parity en/fr/es,
  stable Issue/e2e strings, preserved `data-testid`s, conventional commits.
- /unops-toolkit:code-review after implementation; agent-browser +
  interface-craft pass for the touched UI (drawer + picker).
