import { displayServiceName, memberName, type Expense, type Member } from '../types'
import { toEur, type FxRates } from './currency'
import { isServiceRecurring, type RecurringMap } from './serviceSettings'

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function expensesToCsv(
  expenses: Expense[],
  members: Member[],
  fxRates: FxRates,
  recurringMap: RecurringMap,
): string {
  const headers = [
    'Fecha',
    'Servicio',
    'Miembro',
    'Importe',
    'Moneda',
    'Importe (EUR)',
    'Recurrente',
    'Descripción',
    'Archivo',
  ]
  const rows = expenses.map((e) => {
    const service = displayServiceName(e)
    return [
      e.date,
      service,
      memberName(members, e.memberId),
      e.amount.toFixed(2),
      e.currency,
      toEur(e.amount, e.currency, fxRates).toFixed(2),
      isServiceRecurring(service, recurringMap) ? 'Sí' : 'No',
      e.description,
      e.fileName ?? '',
    ]
  })
  return [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(String(cell))).join(',')).join('\n')
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
