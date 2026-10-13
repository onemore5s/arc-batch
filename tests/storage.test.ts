import { describe, it, expect } from "vitest";
import { IndexedStore, MemoryStore } from "../src/storage";
import { makeRecord } from "./fixtures";
import { vi } from "vitest";
describe.each([MemoryStore, IndexedStore])(
  "Frozen record persistence %s",
  (Store) => {
    it("atomically claims once and saves the attempt and preflight block", async () => {
      const store = new Store(),
        record = makeRecord();
      record.snapshot.batchId = `0x${"6".repeat(64)}`;
      await store.save(record);
      record.preflightBlock = "123";
      record.attempts.push({
        id: "atomic-attempt",
        requestedAt: new Date().toISOString(),
        replacements: [],
      });
      const results = await Promise.allSettled([
        store.claim(record),
        store.claim(record),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const saved = await store.get(record.snapshot);
      expect(saved?.preflightBlock).toBe("123");
      expect(saved?.attempts).toEqual(record.attempts);
      store.close();
    });
    it("preserves amount strings and rejects conflicting snapshots and duplicate claims", async () => {
      const store = new Store(),
        record = makeRecord();
      await store.save(record);
      expect(await store.get(record.snapshot)).toEqual(record);
      const changed = structuredClone(record);
      changed.snapshot.recipients[0].label = "不同快照";
      await expect(store.save(changed)).rejects.toThrow(/快照/);
      const claimed = await store.claim(record);
      expect(claimed.status).toBe("awaiting_signature");
      await expect(store.claim(record)).rejects.toThrow();
      expect((await store.list()).length).toBeGreaterThan(0);
      store.close();
    });
  },
);
describe("Drafts and cross-tab notifications", () => {
  it("persists drafts in IndexedDB, broadcasts changes, and unsubscribes", async () => {
    const store = new IndexedStore();
    await store.saveDraft({ name: "草稿" });
    expect(await store.loadDraft()).toEqual({ name: "草稿" });
    const callback = vi.fn(),
      unsubscribe = store.subscribe(callback),
      other = new IndexedStore();
    const record = makeRecord();
    record.snapshot.batchId = `0x${"7".repeat(64)}`;
    await other.save(record);
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
    unsubscribe();
    store.close();
    other.close();
  });
  it("persists atomically without BroadcastChannel and rejects digest tampering", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const store = new IndexedStore();
    const record = makeRecord();
    record.snapshot.batchId = `0x${"8".repeat(64)}`;
    await store.save(record);
    await store.claim(record);
    store.close();
    vi.unstubAllGlobals();
    const memory = new MemoryStore();
    const bad = makeRecord();
    bad.snapshot.totalNative = "1";
    await expect(memory.save(bad)).rejects.toThrow("冻结快照");
    const empty = new MemoryStore();
    expect((await empty.claim(makeRecord())).status).toBe("awaiting_signature");
  });
});
