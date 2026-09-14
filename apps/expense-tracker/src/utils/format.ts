export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

// For aggregate figures (totals, averages) where cents add noise without
// adding information — individual invoice amounts still use formatMoney.
export function formatMoneyRound(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${Math.round(amount)} ${currency}`
  }
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function daysAgoISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
