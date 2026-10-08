import type { QueuedDetection } from "./api";

const databaseName = "signflow-offline";
const storeName = "pending-detections";
type PendingItem = QueuedDetection & { id: string; queuedAt: string };

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage."));
  });
}

export async function enqueueOffline(record: QueuedDetection) {
  if (typeof indexedDB === "undefined") throw new Error("Offline storage is unavailable in this browser.");
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).add({ ...record, id: crypto.randomUUID(), queuedAt: new Date().toISOString() } satisfies PendingItem);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the offline detection."));
  });
  database.close();
}

export async function flushOffline(save: (record: QueuedDetection) => Promise<unknown>) {
  if (typeof indexedDB === "undefined" || !navigator.onLine) return;
  const database = await openDatabase();
  const pending = await new Promise<PendingItem[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as PendingItem[]);
    request.onerror = () => reject(request.error ?? new Error("Could not read offline detections."));
  });
  for (const item of pending) {
    try {
      await save({ sign: item.sign, confidence: item.confidence, sessionId: item.sessionId });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).delete(item.id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove a synced detection."));
      });
    } catch {
      break;
    }
  }
  database.close();
}
