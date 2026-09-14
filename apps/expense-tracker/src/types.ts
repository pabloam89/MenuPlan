export const SERVICES = [
  'Vercel',
  'Cursor',
  'Midjourney',
  'Gemini AI Studio',
  'Da Vinci Resolve',
  'Google Workspace',
  'Claude (Anthropic)',
  'API de MenuPlan',
  'Otro',
] as const

export type ServiceName = (typeof SERVICES)[number]

export type ExpenseStatus = 'processing' | 'done' | 'error' | 'manual'

export interface Expense {
  id: string
  fileId: string | null
  fileName: string | null
  fileType: string | null
  date: string // YYYY-MM-DD
  amount: number
  currency: string
  service: ServiceName
  customService: string | null
  description: string
  createdAt: string // ISO timestamp
  status: ExpenseStatus
  errorMessage: string | null
  memberId: string | null // quién pagó la factura
  settledBy: string[] // ids de los miembros que ya han devuelto su parte al pagador
}

export interface Member {
  id: string
  name: string
  since: string // YYYY-MM-DD — cuándo se unió
  leftAt: string | null // YYYY-MM-DD — cuándo causó baja; null = sigue activo
}

export interface StoredFile {
  id: string
  blob: Blob
  name: string
  type: string
  size: number
  createdAt: string
}

export interface ExtractedInvoiceFields {
  date: string | null
  amount: number | null
  currency: string | null
  service: ServiceName | null
  customService: string | null
  description: string | null
}

export function displayServiceName(expense: Pick<Expense, 'service' | 'customService'>): string {
  if (expense.service === 'Otro' && expense.customService) return expense.customService
  return expense.service
}

export function memberName(members: Member[], memberId: string | null): string {
  if (!memberId) return ''
  return members.find((m) => m.id === memberId)?.name ?? ''
}

export function activeMemberCount(members: Member[]): number {
  return members.filter((m) => !m.leftAt).length
}

// Splits an expense's amount evenly across everyone currently active — the
// simplifying assumption the whole app uses for group costs (matches the
// "Gasto ÷ miembros" dashboard stat). Null when there's no one to split
// across.
export function perHeadAmount(amount: number, members: Member[]): number | null {
  const count = activeMemberCount(members)
  return count > 0 ? amount / count : null
}

// Records created before "settledBy" existed have it as `undefined` in
// IndexedDB (schema-less store) even though the type says `string[]`.
export function settledByOf(expense: Pick<Expense, 'settledBy'>): string[] {
  return expense.settledBy ?? []
}
