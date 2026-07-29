# References for Central draft import

## Similar implementations studied

### Published import sequence

- **Location:** `src/core/central/import.ts`
- **Relevance:** the exact flow being generalized; the draft path reuses its
  parse → `normalizeDefaultContent` → `attachmentRefsFor` assembly untouched.
- **Key patterns:** injected client+token (store-owned), `exists:false`
  descriptors skipped, blob `Content-Type` fallback to `DEFAULT_MEDIATYPE`.

### Existing draft endpoints on the client

- **Location:** `src/core/central/client.ts` — `getDraftFormXml`,
  `listDraftAttachments`, `updateDraft`, `uploadDraftAttachment` (publish
  flow). Only the draft attachment *download* was missing.

### Picker filtering + list lifecycle

- **Location:** `src/components/central/CentralFormPicker.vue` +
  `src/composables/useCentralList.ts`
- **Key patterns:** `selectionValid`/`clearSelection` reset semantics —
  the new `selected-form` model must respect the same lifecycle.

### Freshness / never-published semantics

- **Location:** `src/core/central/reconcile.ts` (`reconcileTarget` returns
  `'never-published'` for `publishedAt === null`) — the reason a draft import
  must not seed `lastPublished*` fields (the chip and Check-server would
  contradict each other).

### Component-test harness for the drawer

- **Location:** `tests/component/import-from-central.spec.ts` — hoisted picker
  stubs, faked central store, real Dexie landing. The draft test extends the
  form-picker stub to emit `update:selectedForm`.
