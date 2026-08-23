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
