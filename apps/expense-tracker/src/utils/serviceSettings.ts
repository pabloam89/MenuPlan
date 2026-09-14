// Whether a service (by its display name — see displayServiceName) is a
// recurring subscription or a one-off purchase. This is a property of the
// *service*, not of each individual invoice — set it once in the Servicios
// tab and every past/future expense under that service name follows it.
export type RecurringMap = Record<string, boolean>

const STORAGE_KEY = 'mp_expense_service_recurring'

export function loadRecurringMap(): RecurringMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // localStorage unavailable (private mode edge cases) — fall back to defaults
  }
  return {}
}

export function saveRecurringMap(map: RecurringMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // not fatal — the setting just won't persist across reloads
  }
}

// Unmarked services default to recurring — most things tracked here
// (Vercel, Cursor, Claude…) are subscriptions.
export function isServiceRecurring(serviceName: string, map: RecurringMap): boolean {
  return map[serviceName] ?? true
}
