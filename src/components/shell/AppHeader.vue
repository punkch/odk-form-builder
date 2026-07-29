<script setup lang="ts">
import Button from 'primevue/button'
import { defineAsyncComponent, h, type FunctionalComponent } from 'vue'
import { useRouter } from 'vue-router'

import ToolbarSeparator from '@/components/shell/ToolbarSeparator.vue'
import { useAppI18n } from '@/i18n'
import { useEditorStore } from '@/stores/editor'
import { useEmbedStore } from '@/stores/embed'

// Empty stand-in that keeps the `save-indicator` testid/class in the DOM
// while the real indicator's chunk (which pulls in the form store, and with
// it the whole editor core) is still loading. In practice that chunk is
// already loaded by the time the editor header mounts, so the placeholder is
// rarely visible.
const SaveIndicatorPlaceholder: FunctionalComponent = () =>
  h('span', { class: 'save-indicator', 'data-testid': 'save-indicator' })

// Lazy: the form store (and the editor core behind it) must not be part of
// AppHeader's static import graph — see SaveIndicator.vue, which reads the
// store itself.
const SaveIndicator = defineAsyncComponent({
  loader: () => import('@/components/shell/SaveIndicator.vue'),
  loadingComponent: SaveIndicatorPlaceholder,
  delay: 0,
})

const editor = useEditorStore()
// Embed mode has no library to go back to — the host owns form storage.
const embed = useEmbedStore()
const router = useRouter()
const { t } = useAppI18n()

const backToLibrary = async (): Promise<void> => {
  // Lazy for the same reason as SaveIndicator above: keeps the form store
  // out of AppHeader's static graph.
  const { useFormStore } = await import('@/stores/form')
  await useFormStore().close()
  await router.push({ name: 'library' })
}
</script>

<template>
  <header class="app-header">
    <div class="app-header-left">
      <Button
        v-if="!embed.active"
        v-tooltip.bottom="t('shell.nav.backToForms')"
        icon="pi pi-arrow-left"
        severity="secondary"
        text
        :aria-label="t('shell.nav.backToForms')"
        data-testid="back-to-library"
        @click="backToLibrary"
      />
      <slot name="title-actions" />
      <SaveIndicator />
    </div>
    <div class="app-header-right">
      <slot name="actions" />
      <ToolbarSeparator />
      <Button
        v-tooltip.bottom="t('help.ui.openHelp')"
        icon="pi pi-question-circle"
        severity="secondary"
        text
        :aria-label="t('help.ui.openHelp')"
        data-testid="help-button"
        @click="editor.activeDialog = 'help-reference'"
      />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  height: var(--builder-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--odk-spacing-l);
  padding: 0 var(--odk-spacing-l);
  background: var(--odk-base-background-color);
  border-bottom: var(--builder-panel-border);
  flex-shrink: 0;
}

.app-header-left,
.app-header-right {
  display: flex;
  align-items: center;
  gap: var(--odk-spacing-m);
  min-width: 0;
}

.app-header-left {
  flex: 1 1 auto;
}

.app-header-right {
  flex-shrink: 0;
}

.app-header-left > :deep(.save-indicator),
.app-header-left > :deep([data-testid='save-indicator']) {
  flex-shrink: 0;
  white-space: nowrap;
}

/* The Form menu button hosts the form title and is the only shrinkable
   element on the left: the back button must never compress before the
   title finishes truncating (at tablet widths it once collapsed to a
   2px sliver). The title span inside the button owns the ellipsis. */
.app-header-left > :deep([data-testid='back-to-library']) {
  flex-shrink: 0;
}

/* Narrow headers: the save indicator drops to icon-only (its icon already
   encodes saved/saving/error, role=status keeps the text for AT) so the
   left cluster never overflows into the right-side action buttons. */
@media (max-width: 1024px) {
  .app-header-left > :deep([data-testid='save-indicator']) > span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
