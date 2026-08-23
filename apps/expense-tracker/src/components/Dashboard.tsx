import { useMemo, useState } from 'react'
import { displayServiceName, type Expense } from '../types'
import { daysAgoISO, formatMoney } from '../utils/format'
import { serviceColor } from './ServiceBadge'

interface DashboardProps {
  expenses: Expense[]
}

type TrendRange = 30 | 90

function currencyOf(expenses: Expense[]): string {
  return expenses[0]?.currency || 'EUR'
}

function buildTrend(expenses: Expense[], range: TrendRange) {
  const bucketDays = range === 30 ? 1 : 7
  const bucketCount = Math.ceil(range / bucketDays)
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    from: daysAgoISO(range - i * bucketDays),
    total: 0,
  }))

  const cutoff = daysAgoISO(range)
  for (const expense of expenses) {
    if (expense.date < cutoff) continue
    const daysBack = Math.floor(
      (Date.now() - new Date(`${expense.date}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysBack < 0 || daysBack > range) continue
    const bucketIndex = bucketCount - 1 - Math.floor(daysBack / bucketDays)
    if (buckets[bucketIndex]) buckets[bucketIndex].total += expense.amount
  }
  return buckets
}

export function Dashboard({ expenses }: DashboardProps) {
  const [trendRange, setTrendRange] = useState<TrendRange>(30)

  const total = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses])
  const currency = currencyOf(expenses)
  const average = expenses.length ? total / expenses.length : 0

  const byService = useMemo(() => {
    const map = new Map<string, { total: number; count: number; color: string }>()
    for (const expense of expenses) {
      const name = displayServiceName(expense)
      const entry = map.get(name) ?? { total: 0, count: 0, color: serviceColor(expense.service) }
      entry.total += expense.amount
      entry.count += 1
      map.set(name, entry)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [expenses])

  const trend = useMemo(() => buildTrend(expenses, trendRange), [expenses, trendRange])
  const trendMax = Math.max(1, ...trend.map((b) => b.total))

  if (expenses.length === 0) {
    return <div className="empty-state">Sube alguna factura para ver el resumen.</div>
  }

  return (
    <div className="dashboard">
      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-card__label">Total</span>
          <span className="stat-card__value">{formatMoney(total, currency)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Facturas</span>
          <span className="stat-card__value">{expenses.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Gasto medio</span>
          <span className="stat-card__value">{formatMoney(average, currency)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Servicios</span>
          <span className="stat-card__value">{byService.length}</span>
        </div>
      </div>

      <div className="dashboard__grid">
        <section className="panel">
          <h3 className="panel__title">Desglose por servicio</h3>
          <div className="breakdown">
            {byService.map((s) => (
              <div className="breakdown__row" key={s.name}>
                <div className="breakdown__label">
                  <span className="breakdown__dot" style={{ background: s.color }} />
                  <span>{s.name}</span>
                  <span className="muted">
                    {s.count} · media {formatMoney(s.total / s.count, currency)}
                  </span>
                </div>
                <div className="breakdown__bar-track">
                  <div
                    className="breakdown__bar"
                    style={{ width: `${(s.total / total) * 100}%`, background: s.color }}
                  />
                </div>
                <span className="breakdown__amount">{formatMoney(s.total, currency)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <h3 className="panel__title">Tendencia</h3>
            <div className="segmented">
              <button
                type="button"
                className={trendRange === 30 ? 'segmented__btn segmented__btn--active' : 'segmented__btn'}
                onClick={() => setTrendRange(30)}
              >
                30 días
              </button>
              <button
                type="button"
                className={trendRange === 90 ? 'segmented__btn segmented__btn--active' : 'segmented__btn'}
                onClick={() => setTrendRange(90)}
              >
                3 meses
              </button>
            </div>
          </div>
          <div className="trend-chart">
            {trend.map((bucket, i) => (
              <div
                key={i}
                className="trend-chart__bar"
                style={{ height: `${bucket.total ? Math.max(6, (bucket.total / trendMax) * 100) : 2}%` }}
                title={`${bucket.from}: ${formatMoney(bucket.total, currency)}`}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
