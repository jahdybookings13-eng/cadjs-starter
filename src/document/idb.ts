// src/document/idb.ts — IndexedDB adapter for the local document store.
//
// The store keeps a synchronous localStorage mirror so the scene does not have
// to become async. IndexedDB is the primary durable copy when the browser
// supports it; every save is written to both. Node/tests and private modes
// without IndexedDB fall back to the mirror.

import type { CadDocument } from "./model";

const DB_NAME = "scadgen.documents";
const DB_VERSION = 1;
const STORE = "documents";

let dbPromise: Promise<IDBDatabase> | null = null;

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb())
    return Promise.reject(new Error("IndexedDB unavailable"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      dbPromise = null;
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error("IndexedDB open failed"));
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error("IndexedDB open blocked by another tab"));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
  return dbPromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function idbLoadDocuments(): Promise<CadDocument[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  return requestResult(
    tx.objectStore(STORE).getAll() as IDBRequest<CadDocument[]>,
  );
}

export async function idbSaveDocument(doc: CadDocument): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  await requestResult(tx.objectStore(STORE).put(doc));
}

export async function idbDeleteDocument(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  await requestResult(tx.objectStore(STORE).delete(id));
}
