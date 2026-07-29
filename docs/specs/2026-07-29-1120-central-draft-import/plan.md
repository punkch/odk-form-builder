# Central draft import — Plan

## Task 1: Save spec documentation

Create `docs/specs/2026-07-29-1120-central-draft-import/` with plan.md,
shape.md, standards.md, references.md, user-guide.md. (This folder.)

## Task 2: Core — draft download + import source

- `src/core/central/client.ts`: add `downloadDraftAttachment(token, projectId,
  xmlFormId, name): Promise<Blob>` → `GET
  /v1/projects/:id/forms/:xmlFormId/draft/attachments/:name` (mirrors
  `downloadPublishedAttachment`; same `send` error mapping).
- `src/core/central/import.ts`: `CentralImportInput` gains
  `source?: 'published' | 'draft'` (default `'published'`).
  `importFormFromCentral` branches all three reads on it:
  `getDraftFormXml` / `listDraftAttachments` / `downloadDraftAttachment` for
  `'draft'`; the published trio otherwise. Everything downstream
  (parse → normalizeDefaultContent → attachment rebuild) is shared.
- Specs: `client.spec.ts` — endpoint/verb/auth test for
  `downloadDraftAttachment`; `import.spec.ts` — a `'draft'` run hits only
  draft endpoints and returns the same assembled shape; default stays
  published.

## Task 3: Store passthrough

- `src/stores/central.ts`: `importFormFromCentral(serverId, projectId,
  xmlFormId, source: 'published' | 'draft' = 'published')` forwards `source`
  to the core runner. Doc comment updated (no longer "published form" only).

## Task 4: Picker — list drafts, mark them, expose the summary

- `src/components/central/CentralFormPicker.vue`:
  - Remove the `publishedOnly` prop and `isOffered` filter (import drawer was
    its only consumer); all forms are always offered.
  - Option label: `publishedAt === null` →
    `t('central.import.unpublishedForm', { name })`, else the name/formId.
  - Add `v-model:selected-form` (`CentralFormSummary | null`): emitted with
    the matching summary on change, `null` on clear; refreshed after refetch
    so the parent never holds a stale summary.
  - Header comment rewritten.

## Task 5: Import drawer — branch on draft, adjust copy, skip target seeding

- `src/components/central/LibraryCentralDrawer.vue`:
  - Track `selectedForm` via the new picker model; drop `published-only`.
  - `pull()` passes `source: selectedForm?.publishedAt === null ? 'draft' :
    'published'`; remember the source used for the landing step.
  - `seedTarget` is skipped for draft imports (see shape.md decision).
  - The note under the picker uses the renamed `central.import.draftNote`.

## Task 6: i18n (en/fr/es in lockstep)

- `central.import.noForms` reworded ("This project has no forms." + fr/es).
- `central.import.publishedOnly` → renamed `draftNote`, new copy explaining
  the "(unpublished)" marker and draft import.
- New `central.import.unpublishedForm`: "{name} (unpublished)" / fr
  "{name} (non publié)" / es "{name} (sin publicar)".

## Task 7: Component tests

- `tests/component/import-from-central.spec.ts`: existing expectations gain
  the 4th `importFormFromCentral` arg (`'published'`); new test where the
  picker stub emits a never-published summary → store called with `'draft'`
  and `upsertTarget` NOT called; published path still seeds the target.
- New `tests/component/central-form-picker.spec.ts`: drafts are listed with
  the unpublished suffix, published forms plain; `selected-form` model emits
  the summary on pick and null on clear.

## Task 8: Verify + review + docs

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (e2e unaffected — no testid or
  asserted-string removals; `noForms`/note copy changed deliberately, grep
  confirmed no test asserts them).
- `/unops-toolkit:code-review` on the diff; fix related findings immediately.
- UI touched ⇒ agent-browser screenshot pass of the drawer picker (isolated
  repro — no live Central needed; stub via listForms) + interface-craft
  critique; log to `docs/verification/`.
- Update CLAUDE.md code-map lines (client draft accessors, import `source`,
  picker models) — same change.
