import type { CSSProperties } from 'react'
import { displayServiceName, type Expense, type ServiceName } from '../types'

// Stable colour per service so the same service always reads the same way
// across the gallery, table and dashboard, without hand-picking each one.
const SERVICE_COLORS: Record<ServiceName, string> = {
  Vercel: '#142f1d',
  Cursor: '#2f6f9f',
  Midjourney: '#5a2d7a',
  'Gemini AI Studio': '#2f7dc0',
  'Da Vinci Resolve': '#b45309',
  'Google Workspace': '#3f9656',
  'Claude (Anthropic)': '#c0703a',
  'API de MenuPlan': '#2d5a3d',
  Otro: '#5a7066',
}

export function serviceColor(service: ServiceName): string {
  return SERVICE_COLORS[service] ?? SERVICE_COLORS.Otro
}

export function ServiceBadge({ expense }: { expense: Pick<Expense, 'service' | 'customService'> }) {
  const color = serviceColor(expense.service)
  return (
    <span className="service-badge" style={{ '--badge-color': color } as CSSProperties}>
      {displayServiceName(expense)}
    </span>
  )
}
