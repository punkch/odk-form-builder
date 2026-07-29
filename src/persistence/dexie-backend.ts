/**
 * The normal browser-library PersistenceBackend, backed by Dexie/IndexedDB.
 * Lives in its own module (not backend.ts) so the seam stays free of the
 * Dexie value import — this file is dynamically imported by main.ts's
 * non-embed boot (and statically by the embed bridge's `persistence: 'local'`
 * switch, which is itself a lazy chunk), keeping ~95 KB of Dexie out of the
 * entry chunk. See the render-blocking invariant in CLAUDE.md.
 */
import { db } from './db'

import type { PersistenceBackend } from './backend'

/** The normal browser-library backend, backed by Dexie/IndexedDB. */
export const dexieBackend: PersistenceBackend = {
  listForms: () => db.forms.orderBy('updatedAt').reverse().toArray(),
  getForm: (id) => db.forms.get(id),
  bulkGetForms: (ids) => db.forms.bulkGet(ids),
  addForm: async (record) => { await db.forms.add(record) },
  putForm: async (record) => {
    const existing = await db.forms.get(record.id)
    if (existing === undefined) throw new Error(`Form record ${record.id} does not exist`)
    await db.forms.put({ ...record, createdAt: existing.createdAt })
  },
  deleteFormCascade: async (id) => {
    await db.transaction('rw', [db.forms, db.attachments, db.snapshots, db.publishTargets], async () => {
      await db.forms.delete(id)
      await db.attachments.where('formRecordId').equals(id).delete()
      await db.snapshots.where('formRecordId').equals(id).delete()
      await db.publishTargets.where('formRecordId').equals(id).delete()
    })
  },
  importForm: async (record, attachments) => {
    await db.transaction('rw', [db.forms, db.attachments], async () => {
      await db.attachments.bulkAdd(attachments)
      await db.forms.add(record)
    })
  },
  replaceForm: async (record, attachments) => {
    await db.transaction('rw', [db.forms, db.attachments], async () => {
      const existing = await db.forms.get(record.id)
      if (existing === undefined) throw new Error(`Form record ${record.id} does not exist`)
      await db.attachments.where('formRecordId').equals(record.id).delete()
      await db.attachments.bulkAdd(attachments)
      await db.forms.put({ ...record, createdAt: existing.createdAt })
    })
  },

  listCentralServers: () => db.centralServers.toArray(),
  getCentralServer: (id) => db.centralServers.get(id),
  addCentralServer: async (record) => { await db.centralServers.add(record) },
  putCentralServer: async (record) => { await db.centralServers.put(record) },
  deleteCentralServer: async (id) => {
    await db.transaction('rw', [db.centralServers, db.publishTargets], async () => {
      await db.centralServers.delete(id)
      await db.publishTargets.where('serverId').equals(id).delete()
    })
  },

  getVaultMeta: () => db.centralVault.get('vault'),
  putVaultMeta: async (record) => { await db.centralVault.put(record) },
  resetVault: async (meta) => {
    await db.transaction('rw', [db.centralVault, db.centralServers], async () => {
      await db.centralVault.put(meta)
      await db.centralServers.toCollection().modify((server) => { delete server.encryptedPassword })
    })
  },

  listPublishTargets: (formRecordId) => db.publishTargets.where('formRecordId').equals(formRecordId).toArray(),
  upsertPublishTarget: async (record) => { await db.publishTargets.put(record) },

  listAttachments: (formRecordId) => db.attachments.where('formRecordId').equals(formRecordId).toArray(),
  getAttachment: (id) => db.attachments.get(id),
  bulkGetAttachments: (ids) => db.attachments.bulkGet(ids),
  addAttachment: async (record) => { await db.attachments.add(record) },
  bulkAddAttachments: async (records) => { await db.attachments.bulkAdd(records) },
  deleteAttachment: async (id) => { await db.attachments.delete(id) },
  bulkDeleteAttachments: async (ids) => { await db.attachments.bulkDelete(ids) },
  renameAttachment: async (id, filename) => {
    const updated = await db.attachments.update(id, { filename })
    if (updated === 0) throw new Error(`Attachment ${id} does not exist`)
  },

  addSnapshot: async (record) => { await db.snapshots.add(record) },
  listSnapshots: (formRecordId) => db.snapshots.where('formRecordId').equals(formRecordId).sortBy('createdAt'),
  bulkDeleteSnapshots: async (ids) => { await db.snapshots.bulkDelete(ids) },

  listTemplates: () => db.templates.orderBy('updatedAt').reverse().toArray(),
  getTemplate: (id) => db.templates.get(id),
  addTemplate: async (record) => { await db.templates.add(record) },
  putTemplate: async (record) => { await db.templates.put(record) },
  deleteTemplate: async (id) => { await db.templates.delete(id) },
}
