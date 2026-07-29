<script setup lang="ts">
/**
 * Library-level ODK Central panel — the import counterpart to the editor's
 * `CentralDrawer` (chrome + vault gate shared via `CentralDrawerShell`). Browses
 * a server / project / form (a never-published one imports its current draft),
 * pulls it into the workspace (with attachments), handles a formId collision
 * (copy vs replace), seeds the origin as the form's first tracked publish
 * destination (published imports only), and opens it in the editor.
 *
 * Replaces the old "From Central" source toggle inside the generic Import
 * dialog, so Central import speaks the same drawer language as publishing.
 */
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { computed, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import CentralDrawerShell from '@/components/central/CentralDrawerShell.vue'
import CentralFormPicker from '@/components/central/CentralFormPicker.vue'
import CentralProjectPicker from '@/components/central/CentralProjectPicker.vue'
import CentralServerPicker from '@/components/central/CentralServerPicker.vue'
import ImportCollisionPanel from '@/components/importexport/ImportCollisionPanel.vue'
import ImportReport from '@/components/importexport/ImportReport.vue'
import { useImportLanding } from '@/composables/useImportLanding'
import { contentFingerprint } from '@/core/central/fingerprint'
import type { CentralImportSource } from '@/core/central/import'
import type { CentralFormSummary } from '@/core/central/types'
import type { ImportParseResult } from '@/core/import-form'
import type { ArchiveAttachment } from '@/core/workspace/archive'
import { useAppI18n } from '@/i18n'
import { centralErrorKey as toCentralErrorKey } from '@/i18n/central-errors'
import * as formsRepo from '@/persistence/forms-repo'
import { useCentralStore } from '@/stores/central'

const open = defineModel<boolean>('open', { required: true })

const { t } = useAppI18n()
const router = useRouter()
const confirm = useConfirm()
const toast = useToast()
const central = useCentralStore()

const serverId = ref<string | null>(null)
const projectId = ref<number | null>(null)
const xmlFormId = ref<string | null>(null)
// The picker's summary for the chosen form — the drawer branches published vs
// draft import on its `publishedAt`.
const selectedForm = ref<CentralFormSummary | null>(null)
// The origin the current `result` was pulled from, captured at pull time — the
// landing step seeds the publish target from THIS, never from the live picker
// refs, so a picker change while the pull/landing is in flight can't seed a
// target against the wrong destination.
const pulledFrom = ref<{
  serverId: string
  projectId: number
  xmlFormId: string
  source: CentralImportSource
} | null>(null)
const importingCentral = ref(false)
const centralError = ref<unknown>(null)
// shallowRef: these carry Blobs / go straight into IndexedDB — deep reactivity
// is pointless and risks structured-clone failures.
const centralAttachments = shallowRef<ArchiveAttachment[]>([])
const centralPublishedVersion = ref('')
const centralFormName = ref('')
const result = shallowRef<ImportParseResult | null>(null)

const { landing, collisionRecord, collisionPending, land, landOrCollide, reset: resetLanding } =
  useImportLanding({
    isActive: () => open.value,
    onLanded: async (record) => {
      await seedTarget(record.id)
      await finish(record.id)
    },
    onError: (err) => { centralError.value = err },
  })
const errors = computed(() => result.value?.issues.filter((i) => i.severity === 'error') ?? [])
const warnings = computed(() => result.value?.issues.filter((i) => i.severity !== 'error') ?? [])
const canImport = computed(() => result.value?.document != null && errors.value.length === 0)
const centralErrorText = computed(() => t(toCentralErrorKey(centralError.value)))

const onCentralError = (err: unknown): void => { centralError.value = err }

const reset = (): void => {
  serverId.value = null
  projectId.value = null
  xmlFormId.value = null
  selectedForm.value = null
  pulledFrom.value = null
  importingCentral.value = false
  centralError.value = null
  centralAttachments.value = []
  centralPublishedVersion.value = ''
  centralFormName.value = ''
  result.value = null
  resetLanding()
}

const close = (): void => { open.value = false; reset() }

// --- Pull the chosen form into a parse result --------------------------------
// The id and its summary come from two picker models that settle a tick apart
// while the list refetches; requiring them to agree keeps the published/draft
// branch from ever being decided on a stale pair.
const canPull = computed(() =>
  xmlFormId.value !== null && selectedForm.value?.xmlFormId === xmlFormId.value)

const pull = async (): Promise<void> => {
  const s = serverId.value
  const p = projectId.value
  const f = xmlFormId.value
  const summary = selectedForm.value
  if (s === null || p === null || f === null || summary?.xmlFormId !== f) return
  centralError.value = null
  importingCentral.value = true
  try {
    // A never-published form has no published definition — pull its draft.
    const source: CentralImportSource = summary.publishedAt === null ? 'draft' : 'published'
    const pulled = await central.importFormFromCentral(s, p, f, source)
    pulledFrom.value = { serverId: s, projectId: p, xmlFormId: f, source }
    centralAttachments.value = pulled.attachments
    centralPublishedVersion.value = pulled.document.settings.version ?? ''
    centralFormName.value = pulled.document.settings.formTitle ?? f
    result.value = { kind: 'xform', document: pulled.document, issues: pulled.issues }
  } catch (err) {
    onCentralError(err)
  } finally {
    importingCentral.value = false
  }
}

// --- Landing ----------------------------------------------------------------
const seedTarget = async (formRecordId: string): Promise<void> => {
  const origin = pulledFrom.value
  const doc = result.value?.document
  if (origin === null || doc == null) return
  // A draft import has no publish history — seeding lastPublished* would
  // fabricate one and break the freshness chip (shape.md decision, 2026-07-29
  // central-draft-import). The user adds a destination on first real publish.
  if (origin.source === 'draft') return
  await central.upsertTarget({
    formRecordId,
    serverId: origin.serverId,
    projectId: origin.projectId,
    xmlFormId: origin.xmlFormId,
    lastPublishedVersion: centralPublishedVersion.value,
    lastPublishedAt: Date.now(),
    // The imported doc IS what Central holds, so its fingerprint seeds freshness.
    lastPublishedContentHash: await contentFingerprint(doc),
  })
}

const finish = async (formRecordId: string): Promise<void> => {
  toast.add({
    severity: 'success',
    summary: t('central.import.imported', { name: centralFormName.value }),
    detail: t('central.import.attachmentsPulled', { count: centralAttachments.value.length }, centralAttachments.value.length),
    life: 3000,
  })
  close()
  await router.push({ name: 'editor', params: { formId: formRecordId } })
}

const landCopy = async (): Promise<void> => {
  const doc = result.value?.document
  if (doc == null) return
  await land(() => formsRepo.createFormWithArchiveAttachments(doc, centralAttachments.value))
}

const landReplace = (): void => {
  const existing = collisionRecord.value
  const doc = result.value?.document
  if (existing == null || doc == null) return
  confirm.require({
    header: t('central.import.collisionTitle'),
    message: t('central.import.replaceConfirm', { name: existing.title }),
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: t('central.import.replaceAccept'),
    rejectLabel: t('common.cancel'),
    acceptProps: { severity: 'danger' },
    accept: () => {
      void land(() => formsRepo.replaceFormWithArchiveAttachments(existing.id, doc, centralAttachments.value))
    },
  })
}

/** Import: a formId already in the library offers copy vs replace, else copy. */
const importForm = async (): Promise<void> => {
  const doc = result.value?.document
  if (doc == null) return
  await landOrCollide(
    doc.settings.formId ?? '',
    () => formsRepo.createFormWithArchiveAttachments(doc, centralAttachments.value)
  )
}
</script>

<template>
  <CentralDrawerShell
    variant="library"
    testid="library-central-drawer"
    close-testid="library-central-close"
    @close="close"
  >
    <div v-if="result === null" class="import-central" data-testid="library-central-browse">
      <p class="import-central-intro">{{ t('central.import.intro') }}</p>
      <div class="import-field">
        <label>{{ t('central.import.serverLabel') }}</label>
        <CentralServerPicker v-model="serverId" />
      </div>
      <div class="import-field">
        <label>{{ t('central.import.projectLabel') }}</label>
        <CentralProjectPicker v-model="projectId" :server-id="serverId" @error="onCentralError" />
      </div>
      <div class="import-field">
        <label>{{ t('central.import.formLabel') }}</label>
        <CentralFormPicker
          v-model="xmlFormId"
          v-model:selected-form="selectedForm"
          :server-id="serverId"
          :project-id="projectId"
          @error="onCentralError"
        />
        <small class="import-central-note">{{ t('central.import.draftNote') }}</small>
      </div>
      <Message v-if="centralError !== null" severity="error" data-testid="library-central-error">
        {{ centralErrorText }}
      </Message>
      <div class="import-central-actions">
        <Button
          :label="t('central.import.confirm')"
          icon="pi pi-cloud-download"
          :loading="importingCentral"
          :disabled="!canPull"
          data-testid="library-central-pull"
          @click="pull"
        />
      </div>
    </div>

    <div v-else class="import-landing" data-testid="library-central-report">
      <ImportReport :result="result" :name="centralFormName" />

      <ImportCollisionPanel
        v-if="collisionPending"
        :message="t('central.import.collision', { formId: collisionRecord?.formId ?? '' })"
        :copy-label="t('central.import.copy')"
        :replace-label="t('central.import.replace')"
        :landing="landing"
        testid-prefix="library-central-collision"
        @copy="landCopy"
        @replace="landReplace"
      />

      <Message v-if="centralError !== null" severity="error" data-testid="library-central-error">
        {{ centralErrorText }}
      </Message>

      <div v-if="!collisionPending" class="import-central-actions">
        <Button :label="t('common.cancel')" severity="secondary" text @click="reset" />
        <Button
          :label="warnings.length > 0 ? t('importExport.import.confirmAnyway') : t('importExport.import.confirm')"
          :disabled="!canImport"
          :loading="landing"
          data-testid="library-central-import"
          @click="importForm"
        />
      </div>
    </div>
  </CentralDrawerShell>
</template>

<style scoped>
.import-central {
  display: flex;
  flex-direction: column;
  gap: var(--odk-spacing-m);
}

.import-central-intro {
  margin: 0;
  font-size: var(--odk-hint-font-size);
  color: var(--odk-muted-text-color);
}

.import-field {
  display: flex;
  flex-direction: column;
  gap: var(--odk-spacing-s);
}

.import-field label {
  font-size: var(--odk-hint-font-size);
  font-weight: 600;
}

.import-central-note {
  font-size: var(--odk-hint-font-size);
  color: var(--odk-muted-text-color);
}

.import-central-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--odk-spacing-s);
}
</style>
