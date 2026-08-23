import type { Expense, StoredFile } from './types'

const DB_NAME = 'menuplan-expense-tracker'
const DB_VERSION = 1
const FILES_STORE = 'files'
const EXPENSES_STORE = 'expenses'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(EXPENSES_STORE)) {
        const store = db.createObjectStore(EXPENSES_STORE, { keyPath: 'id' })
        store.createIndex('service', 'service', { unique: false })
        store.createIndex('date', 'date', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = run(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function saveFile(id: string, file: File | Blob, name: string): Promise<void> {
  const stored: StoredFile = {
    id,
    blob: file,
    name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    createdAt: new Date().toISOString(),
  }
  await tx(FILES_STORE, 'readwrite', (s) => s.put(stored))
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
  return tx(FILES_STORE, 'readonly', (s) => s.get(id))
}

export async function deleteFile(id: string): Promise<void> {
  await tx(FILES_STORE, 'readwrite', (s) => s.delete(id))
}

export async function listExpenses(): Promise<Expense[]> {
  const all = await tx<Expense[]>(EXPENSES_STORE, 'readonly', (s) => s.getAll())
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function putExpense(expense: Expense): Promise<void> {
  await tx(EXPENSES_STORE, 'readwrite', (s) => s.put(expense))
}

export async function deleteExpense(id: string): Promise<void> {
  await tx(EXPENSES_STORE, 'readwrite', (s) => s.delete(id))
}

export async function clearAll(): Promise<void> {
  await tx(EXPENSES_STORE, 'readwrite', (s) => s.clear())
  await tx(FILES_STORE, 'readwrite', (s) => s.clear())
}
