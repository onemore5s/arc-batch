import { openDB } from "idb";
import { SETTINGS } from "./config";
import { recordSchema } from "./domain/schema";
import { makeSnapshot, recordKey } from "./domain/batch";
import type { BatchRecord, Snapshot } from "./domain/types";
export interface RecordStore {
  save(record: BatchRecord): Promise<void>;
  get(snapshot: Snapshot): Promise<BatchRecord | undefined>;
  list(): Promise<BatchRecord[]>;
  claim(record: BatchRecord): Promise<BatchRecord>;
}
function validate(record: BatchRecord) {
  recordSchema.parse(record);
  const snapshot = makeSnapshot(record.snapshot);
  if (
    snapshot.payloadHash !== record.snapshot.payloadHash ||
    snapshot.totalNative !== record.snapshot.totalNative
  )
    throw new Error("冻结快照摘要无效");
}
function conflict(previous: BatchRecord | undefined, record: BatchRecord) {
  if (
    previous &&
    JSON.stringify(previous.snapshot) !== JSON.stringify(record.snapshot)
  )
    throw new Error("同一批次已有不同冻结快照，拒绝覆盖");
}
function claimed(
  previous: BatchRecord | undefined,
  record: BatchRecord,
): BatchRecord {
  conflict(previous, record);
  if ((previous ?? record).status !== "ready")
    throw new Error("批次正在处理或已完成，请先核验结果");
  return {
    ...structuredClone(record),
    status: "awaiting_signature",
  };
}
export class MemoryStore implements RecordStore {
  private records = new Map<string, BatchRecord>();
  async save(record: BatchRecord) {
    validate(record);
    conflict(this.records.get(recordKey(record.snapshot)), record);
    this.records.set(recordKey(record.snapshot), structuredClone(record));
  }
  async get(s: Snapshot) {
    const record = this.records.get(recordKey(s));
    return record && structuredClone(record);
  }
  async list() {
    return structuredClone([...this.records.values()]);
  }
  async claim(record: BatchRecord) {
    validate(record);
    const key = recordKey(record.snapshot),
      next = claimed(this.records.get(key), record);
    this.records.set(key, structuredClone(next));
    return next;
  }
  close() {}
}
export class IndexedStore implements RecordStore {
  private db = openDB(SETTINGS.storageName, SETTINGS.storageVersion, {
    upgrade(db) {
      db.createObjectStore("batches");
      db.createObjectStore("drafts");
    },
  });
  private channel =
    typeof BroadcastChannel === "undefined"
      ? undefined
      : new BroadcastChannel(SETTINGS.channel);
  async save(record: BatchRecord) {
    validate(record);
    const db = await this.db,
      tx = db.transaction("batches", "readwrite"),
      key = recordKey(record.snapshot);
    const previous = (await tx.store.get(key)) as BatchRecord | undefined;
    try {
      conflict(previous, record);
      await tx.store.put(record, key);
      await tx.done;
    } catch (e) {
      tx.abort();
      await tx.done.catch(() => {});
      throw e;
    }
    this.channel?.postMessage(key);
  }
  async get(s: Snapshot) {
    return (await (await this.db).get("batches", recordKey(s))) as
      BatchRecord | undefined;
  }
  async list() {
    return (await (await this.db).getAll("batches")) as BatchRecord[];
  }
  async claim(record: BatchRecord) {
    validate(record);
    const tx = (await this.db).transaction("batches", "readwrite"),
      key = recordKey(record.snapshot);
    try {
      const next = claimed(await tx.store.get(key), record);
      await tx.store.put(next, key);
      await tx.done;
      this.channel?.postMessage(key);
      return next;
    } catch (e) {
      tx.abort();
      await tx.done.catch(() => {});
      throw e;
    }
  }
  async saveDraft(value: unknown) {
    await (await this.db).put("drafts", value, "current");
  }
  async loadDraft() {
    return (await this.db).get("drafts", "current") as Promise<unknown>;
  }
  subscribe(callback: () => void) {
    this.channel?.addEventListener("message", callback);
    return () => this.channel?.removeEventListener("message", callback);
  }
  close() {
    this.channel?.close();
    void this.db.then((db) => db.close());
  }
}
