import { displayServiceName, type Expense } from '../types'

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function expensesToCsv(expenses: Expense[]): string {
  const headers = ['Fecha', 'Servicio', 'Importe', 'Moneda', 'Descripción', 'Archivo']
  const rows = expenses.map((e) => [
    e.date,
    displayServiceName(e),
    e.amount.toFixed(2),
    e.currency,
    e.description,
    e.fileName ?? '',
  ])
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
