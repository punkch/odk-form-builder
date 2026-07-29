import { flushPromises, type VueWrapper } from '@vue/test-utils'
import Select from 'primevue/select'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CentralFormPicker from '@/components/central/CentralFormPicker.vue'
import type { CentralFormSummary } from '@/core/central/types'

import { freshPinia, mountWith } from './helpers'

// The picker only reaches the Central store for `listForms`; fake it so no
// network or vault is involved.
const listForms = vi.hoisted(() => vi.fn())
vi.mock('@/stores/central', () => ({ useCentralStore: () => ({ listForms }) }))

const FORMS: CentralFormSummary[] = [
  { xmlFormId: 'pub', name: 'Published One', publishedAt: '2026-07-15T00:00:00Z' },
  { xmlFormId: 'dr', name: 'Draft One', publishedAt: null },
]

const mountPicker = (): VueWrapper =>
  mountWith(freshPinia(), CentralFormPicker, {
    props: { serverId: 'srv-1', projectId: 5, modelValue: null },
  })

const getSelect = (wrapper: VueWrapper) =>
  wrapper.getComponent<typeof Select>('[data-testid="central-form-select"]')

beforeEach(() => {
  listForms.mockReset()
  listForms.mockResolvedValue(FORMS)
})

describe('CentralFormPicker', () => {
  it('offers every form, marking never-published ones with the unpublished suffix', async () => {
    const wrapper = mountPicker()
    await flushPromises()

    expect(listForms).toHaveBeenCalledWith('srv-1', 5)
    expect(getSelect(wrapper).props('options')).toEqual([
      { value: 'pub', name: 'Published One', unpublished: false, label: 'Published One' },
      { value: 'dr', name: 'Draft One', unpublished: true, label: 'Draft One (unpublished)' },
    ])
  })

  it('falls back to the xmlFormId inside the unpublished label when the form has no name', async () => {
    listForms.mockResolvedValue([{ xmlFormId: 'dr2', publishedAt: null }])
    const wrapper = mountPicker()
    await flushPromises()

    expect(getSelect(wrapper).props('options')).toEqual([
      { value: 'dr2', name: 'dr2', unpublished: true, label: 'dr2 (unpublished)' },
    ])
  })

  it('re-emits the fresh summary when the selection survives a refetch', async () => {
    const wrapper = mountPicker()
    await flushPromises()
    await wrapper.setProps({ modelValue: 'dr' })
    expect(wrapper.emitted('update:selectedForm')?.at(-1)).toEqual([FORMS[1]])

    // The same form is offered by the new project, but published in the
    // meantime — the parent's copy must flip with it, not stay stale.
    const republished = { xmlFormId: 'dr', name: 'Draft One', publishedAt: '2026-07-20T00:00:00Z' }
    listForms.mockResolvedValue([republished])
    await wrapper.setProps({ projectId: 6 })
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).not.toEqual([null])
    expect(wrapper.emitted('update:selectedForm')?.at(-1)).toEqual([republished])
  })

  it('emits the matching summary on the selected-form model when the draft is picked', async () => {
    const wrapper = mountPicker()
    await flushPromises()

    getSelect(wrapper).vm.$emit('update:modelValue', 'dr')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['dr'])
    // v-model round-trip: the parent writes the picked id back into the prop,
    // which is what derives (and emits) the summary.
    await wrapper.setProps({ modelValue: 'dr' })

    const emitted = wrapper.emitted('update:selectedForm')
    expect(emitted?.at(-1)).toEqual([FORMS[1]])
    expect((emitted!.at(-1)![0] as CentralFormSummary).publishedAt).toBeNull()
  })

  it('nulls the selected-form model when a server change clears the selection', async () => {
    const wrapper = mountPicker()
    await flushPromises()
    await wrapper.setProps({ modelValue: 'dr' })
    expect(wrapper.emitted('update:selectedForm')?.at(-1)).toEqual([FORMS[1]])

    listForms.mockResolvedValue([])
    await wrapper.setProps({ serverId: 'srv-2' })
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
    expect(wrapper.emitted('update:selectedForm')?.at(-1)).toEqual([null])
  })
})
