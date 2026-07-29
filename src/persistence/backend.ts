/**
 * Persistence seam: every repo (forms-repo, attachments-repo, workspace-io)
 * talks to storage exclusively through the active PersistenceBackend, so the
 * repos' exported signatures never change when storage does. This module is
 * deliberately Dexie-free (type imports only): the Dexie/IndexedDB default
 * lives in ./dexie-backend.ts and is installed by main.ts's non-embed boot
 * via dynamic import, keeping Dexie out of the render-blocking entry chunk
 * (see the web-forms/critical-path invariant in CLAUDE.md). Embed mode
 * installs the Map-based backend from ./memory-backend.ts instead, so nothing
 * touches the user's browser library unless the host asks for
 * `persistence: 'local'`.
 */
import type {
  AttachmentRecord,
  CentralServerRecord,
  CentralVaultRecord,
  FormRecord,
  PublishTargetRecord,
  SnapshotRecord,
  TemplateRecord,
} from './db'

export interface PersistenceBackend {
  /** All forms, most recently updated first. */
  listForms: () => Promise<FormRecord[]>
  getForm: (id: string) => Promise<FormRecord | undefined>
  /** Positional lookup — unknown ids yield undefined holes. */
  bulkGetForms: (ids: string[]) => Promise<Array<FormRecord | undefined>>
  /** Insert a new form; rejects when the id already exists. */
  addForm: (record: FormRecord) => Promise<void>
  /** Update an existing form, preserving its stored `createdAt` (the caller's
   * createdAt on `record` is ignored); rejects when no record with that id
   * exists, so a stray autosave never resurrects a deleted form. */
  putForm: (record: FormRecord) => Promise<void>
  /** Delete a form together with its attachments, snapshots and publish
   * targets. */
  deleteFormCascade: (id: string) => Promise<void>
  /** Atomically add one new form and its attachment records (archive import):
   * a failure must leave neither the form nor any of its attachments behind. */
  importForm: (record: FormRecord, attachments: AttachmentRecord[]) => Promise<void>
  /** Atomically overwrite an existing form and its attachments, keeping the
   * record id and its stored `createdAt` (the caller's createdAt is ignored,
   * mirroring putForm). Old attachments are replaced by the supplied set;
   * snapshots and publish targets are left untouched (a collision "replace"
   * keeps the form's identity and its remembered targets). Rejects when no
   * record with that id exists. */
  replaceForm: (record: FormRecord, attachments: AttachmentRecord[]) => Promise<void>

  /** All registered Central servers, in primary-key order. */
  listCentralServers: () => Promise<CentralServerRecord[]>
  getCentralServer: (id: string) => Promise<CentralServerRecord | undefined>
  /** Insert a new server; rejects when the id already exists. */
  addCentralServer: (record: CentralServerRecord) => Promise<void>
  /** Insert-or-replace a server by id. */
  putCentralServer: (record: CentralServerRecord) => Promise<void>
  /** Delete a server together with every publish target that points at it. */
  deleteCentralServer: (id: string) => Promise<void>

  /** The single global vault-meta row, or undefined before first use. */
  getVaultMeta: () => Promise<CentralVaultRecord | undefined>
  putVaultMeta: (record: CentralVaultRecord) => Promise<void>
  /** Forgotten-passphrase reset: atomically write the new vault meta AND wipe
   * the encrypted password off every server row, keeping the server rows. */
  resetVault: (meta: CentralVaultRecord) => Promise<void>

  /** A form's remembered publish targets. */
  listPublishTargets: (formRecordId: string) => Promise<PublishTargetRecord[]>
  /** Insert-or-replace a publish target by id. */
  upsertPublishTarget: (record: PublishTargetRecord) => Promise<void>

  listAttachments: (formRecordId: string) => Promise<AttachmentRecord[]>
  getAttachment: (id: string) => Promise<AttachmentRecord | undefined>
  /** Positional lookup — unknown ids yield undefined holes. */
  bulkGetAttachments: (ids: string[]) => Promise<Array<AttachmentRecord | undefined>>
  addAttachment: (record: AttachmentRecord) => Promise<void>
  bulkAddAttachments: (records: AttachmentRecord[]) => Promise<void>
  deleteAttachment: (id: string) => Promise<void>
  bulkDeleteAttachments: (ids: string[]) => Promise<void>
  /** Update a stored attachment's filename in place (rename). Rejects when no record with that id exists. */
  renameAttachment: (id: string, filename: string) => Promise<void>

  addSnapshot: (record: SnapshotRecord) => Promise<void>
  /** Snapshots of one form, oldest first. */
  listSnapshots: (formRecordId: string) => Promise<SnapshotRecord[]>
  bulkDeleteSnapshots: (ids: string[]) => Promise<void>

  /** All locally saved "Save as template" forms, most recently updated first. */
  listTemplates: () => Promise<TemplateRecord[]>
  getTemplate: (id: string) => Promise<TemplateRecord | undefined>
  /** Insert a new template; rejects when the id already exists. */
  addTemplate: (record: TemplateRecord) => Promise<void>
  /** Insert-or-replace a template by id. */
  putTemplate: (record: TemplateRecord) => Promise<void>
  /** Delete a template by id. */
  deleteTemplate: (id: string) => Promise<void>
}

let activeBackend: PersistenceBackend | null = null

export const getPersistenceBackend = (): PersistenceBackend => {
  if (activeBackend === null) {
    // Boot installs a backend before anything can reach a repo (main.ts:
    // Dexie via ./dexie-backend on the local path, memory backend in embed;
    // test setups install the Dexie default globally), so this firing means
    // a new code path ran persistence ahead of that wiring.
    throw new Error('No persistence backend installed yet')
  }
  return activeBackend
}

export const setPersistenceBackend = (backend: PersistenceBackend): void => {
  activeBackend = backend
}
