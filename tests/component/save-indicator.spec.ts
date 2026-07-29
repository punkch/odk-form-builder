import type { Pinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import SaveIndicator from '@/components/shell/SaveIndicator.vue'
import type { SaveState } from '@/stores/form'
import { useFormStore } from '@/stores/form'

import { freshPinia, mountWith } from './helpers'

describe('SaveIndicator', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = freshPinia()
  })

  it.each([
    ['saved', 'All changes saved'],
    ['saving', 'Saving…'],
    ['dirty', 'Unsaved changes'],
    ['error', 'Save failed'],
  ] as [SaveState, string][])('renders the %s state', (state, text) => {
    useFormStore().saveState = state
    const wrapper = mountWith(pinia, SaveIndicator)
    expect(wrapper.text()).toContain(text)
    expect(wrapper.classes()).toContain(state)
  })
})
