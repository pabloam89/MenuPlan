import { SERVICES, type ExtractedInvoiceFields, type ServiceName } from './types'

export const ACCESS_CODE_KEY = 'mp_expense_access_code'

export function getAccessCode(): string {
  try {
    return sessionStorage.getItem(ACCESS_CODE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setAccessCode(code: string): void {
  try {
    sessionStorage.setItem(ACCESS_CODE_KEY, code)
  } catch {
    // sessionStorage unavailable (private mode edge cases) — extraction will
    // just fail with 401 again next call, which re-prompts. Not fatal.
  }
}

export class AccessCodeError extends Error {}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'))
    reader.onload = () => {
      const result = reader.result as string
      // "data:<mime>;base64,AAAA..." — strip the prefix, Anthropic wants raw base64
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

function isServiceName(value: unknown): value is ServiceName {
  return typeof value === 'string' && (SERVICES as readonly string[]).includes(value)
}

export async function extractInvoiceData(file: File): Promise<ExtractedInvoiceFields> {
  const fileBase64 = await fileToBase64(file)
  const mediaType = file.type || 'application/octet-stream'

  const response = await fetch('/api/expense-extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getAccessCode(),
    },
    body: JSON.stringify({ fileBase64, mediaType, filename: file.name }),
  })

  if (response.status === 401) {
    throw new AccessCodeError('Código de acceso inválido o requerido.')
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data?.error || `Error al leer la factura (HTTP ${response.status})`)
  }

  return {
    date: typeof data.date === 'string' ? data.date : null,
    amount: typeof data.amount === 'number' && Number.isFinite(data.amount) ? data.amount : null,
    currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : null,
    service: isServiceName(data.service) ? data.service : null,
    customService: typeof data.customService === 'string' ? data.customService : null,
    description: typeof data.description === 'string' ? data.description : null,
  }
}
