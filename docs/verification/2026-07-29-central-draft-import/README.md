# Central draft import — agent-browser verification pass

**Date:** 2026-07-29 · **Build:** dev server (`pnpm dev`, port 5199), Chromium
via agent-browser · **Spec:** `docs/specs/2026-07-29-1120-central-draft-import/`

Walkthrough of the library Central import drawer against a fully **mocked
Central** (agent-browser `network route` stubs on a same-origin
`/fake-central/v1/*` base URL — the client treats the base URL as opaque, so
same-origin mocking avoids CORS): sessions, projects, a forms list with one
published + two never-published forms, `draft_form/draft.xml` and its empty
`draft/attachments`.

## Setup

Cleared site storage, registered "Central-DEV" (`http://localhost:5199/fake-central`)
in Settings, saved a password → created the vault, opened the library Central
drawer.

## Results

| Scenario (user-guide.md) | Result | Evidence |
| --- | --- | --- |
| 3 — Mixed project listing | **PASS** — dropdown offers all three forms: "Water survey" plain, "All question types (unpublished)", "Pizza questionnaire (unpublished)". The tag renders muted + smaller than the name (post-critique polish); the option's accessible name is the full string. | `01-dropdown-unpublished-labels.png` |
| Draft note + gating | **PASS** — note under the picker reads "Forms marked \"unpublished\" have never been published — importing one pulls its current draft." Import stays disabled until the picked id and its summary agree, then enables. | `02-draft-selected-note.png` |
| 1 — Draft-only import | **PASS** — pulling "All question types" hit `draft.xml` + `draft/attachments` (network log), report shows "read as XForm XML. No problems found.", Import landed the form (1 question, `draft_form` v2024091201) in the library. | `03-draft-pull-report.png` |
| 1 — No seeded destination | **PASS** — the imported form's editor Central drawer (after the once-per-session unlock) shows "This form hasn't been published to any Central destination yet." — no fabricated publish history. | `04-editor-drawer-no-seeded-destination.png` |

Note: one editor navigation right after Import failed with a vite dev-server
"Failed to fetch dynamically imported module" (HMR module-graph invalidation
from live edits during the session) — reproduced nowhere after a reload;
not a product bug.

## Not covered here (component tests against a mocked store/client)

Published-path target seeding + `'published'` source arg, draft-path
`upsertTarget` never called, draft endpoints only for `source:'draft'`,
selection-survives-refetch summary refresh, nameless-form label fallback,
empty-project message — `tests/component/{import-from-central,central-form-picker}.spec.ts`,
`src/core/central/{client,import}.spec.ts`.

## Screenshots

- `01-dropdown-unpublished-labels.png` — open form dropdown, muted "(unpublished)" tags.
- `02-draft-selected-note.png` — draft selected, note + enabled Import.
- `03-draft-pull-report.png` — parse report for the pulled draft.
- `04-editor-drawer-no-seeded-destination.png` — editor drawer, empty destinations.
