<script setup lang="ts">
/**
 * Form dropdown for a chosen server + project. Fetches the form list from
 * Central (`central.listForms`) when either changes — every form is offered,
 * with never-published ones (`publishedAt === null`) marked by a localized
 * "(unpublished)" suffix. Besides `modelValue` (the xmlFormId) the picker
 * exposes a second model, `selected-form`, carrying the matching
 * `CentralFormSummary` so a parent can branch on `publishedAt` without ever
 * holding a stale summary across a refetch or clear. Resets across changes
 * and re-throws transport failures to the parent via `error`.
 */
import Select from 'primevue/select'
import { computed, watch } from 'vue'

import { useCentralList } from '@/composables/useCentralList'
import type { CentralFormSummary } from '@/core/central/types'
import { useAppI18n } from '@/i18n'
import { useCentralStore } from '@/stores/central'

const props = defineProps<{
  serverId: string | null
  projectId: number | null
  modelValue: string | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  error: [error: unknown]
}>()
const selectedForm = defineModel<CentralFormSummary | null>('selectedForm', { default: null })

const central = useCentralStore()
const { t } = useAppI18n()

// Reset + refetch whenever the server or project changes. A still-valid
// selection survives the refetch; one no longer offered (absent) is cleared.
const { items: forms, loading } = useCentralList<CentralFormSummary, readonly [string | null, number | null]>({
  deps: () => [props.serverId, props.projectId] as const,
  ready: ([serverId, projectId]) => serverId !== null && projectId !== null,
  fetch: ([serverId, projectId]) => central.listForms(serverId!, projectId!),
  selectionValid: (fetched) =>
    props.modelValue === null || fetched.some((form) => form.xmlFormId === props.modelValue),
  clearSelection: () => { if (props.modelValue !== null) emit('update:modelValue', null) },
  onError: (error) => emit('error', error),
})

// A never-published form is decorated so the user knows the import pulls its
// current draft. `label` carries the full text (closed-combobox display and
// the option's accessible name); the option slot re-renders it with the tag
// muted so state reads separately from identity in the open list.
const options = computed(() =>
  forms.value.map((form) => {
    const name = form.name ?? form.xmlFormId
    const unpublished = form.publishedAt === null
    return {
      value: form.xmlFormId,
      name,
      unpublished,
      label: unpublished ? `${name} ${t('central.import.unpublishedTag')}` : name,
    }
  }))

// The `selected-form` model is derived from the id + the freshest list (never
// cached), so the parent's copy is refreshed after every refetch and nulled
// on clear.
const selectedSummary = computed<CentralFormSummary | null>(() =>
  forms.value.find((form) => form.xmlFormId === props.modelValue) ?? null)
watch(selectedSummary, (summary) => { selectedForm.value = summary })

const onChange = (value: string | null): void => { emit('update:modelValue', value) }
</script>

<template>
  <Select
    :model-value="modelValue"
    :options="options"
    option-label="label"
    option-value="value"
    :loading="loading"
    :disabled="serverId === null || projectId === null"
    :placeholder="t('central.import.formPlaceholder')"
    :empty-message="t('central.import.noForms')"
    data-testid="central-form-select"
    @update:model-value="onChange"
  >
    <template #option="{ option }">
      <span>{{ option.name }}</span>
      <span v-if="option.unpublished" class="unpublished-tag">
        {{ t('central.import.unpublishedTag') }}
      </span>
    </template>
  </Select>
</template>

<style scoped>
.unpublished-tag {
  margin-inline-start: var(--odk-spacing-s);
  color: var(--odk-muted-text-color);
  font-size: var(--odk-hint-font-size);
}
</style>
