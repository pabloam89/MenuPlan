import { useMemo, useState } from 'react'
import { Calculator, Coins, Layers, Merge, Receipt, Repeat, Users, Wallet } from 'lucide-react'
import { displayServiceName, type Expense, type Member, type ServiceName } from '../types'
import { daysAgoISO, formatMoneyRound } from '../utils/format'
import { convert, toEur, type FxRates } from '../utils/currency'
import { isServiceRecurring, type RecurringMap } from '../utils/serviceSettings'
import { serviceColor } from './ServiceBadge'
import { FxRatesModal } from './FxRatesModal'

interface DashboardProps {
  expenses: Expense[]
  members: Member[]
  fxRates: FxRates
  recurringMap: RecurringMap
  onSaveFxRates: (rates: FxRates) => void
  onOpenMergeModal: () => void
}

type TrendRange = 30 | 90 | 12

const MONTH_LABEL = new Intl.DateTimeFormat('es-ES', { month: 'short' })

function buildDailyTrend(expenses: Expense[], range: 30 | 90, rates: FxRates) {
  const bucketDays = range === 30 ? 1 : 7
  const bucketCount = Math.ceil(range / bucketDays)
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    label: '',
    title: daysAgoISO(range - i * bucketDays),
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
    if (buckets[bucketIndex]) buckets[bucketIndex].total += toEur(expense.amount, expense.currency, rates)
  }
  return buckets
}

function buildMonthlyTrend(expenses: Expense[], monthsBack: number, rates: FxRates) {
  const now = new Date()
  const buckets = Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1)
    const label = MONTH_LABEL.format(d)
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label,
      title: `${label} ${d.getFullYear()}`,
      total: 0,
    }
  })
  const indexByKey = new Map(buckets.map((b, i) => [b.key, i]))
  for (const expense of expenses) {
    const idx = indexByKey.get(expense.date.slice(0, 7))
    if (idx === undefined) continue
    buckets[idx].total += toEur(expense.amount, expense.currency, rates)
  }
  return buckets
}

export function Dashboard({ expenses, members, fxRates, recurringMap, onSaveFxRates, onOpenMergeModal }: DashboardProps) {
  const [trendRange, setTrendRange] = useState<TrendRange>(30)
  const [showFxModal, setShowFxModal] = useState(false)
  const [serviceCurrency, setServiceCurrency] = useState<'EUR' | 'USD'>('EUR')

  const total = useMemo(
    () => expenses.reduce((sum, e) => sum + toEur(e.amount, e.currency, fxRates), 0),
    [expenses, fxRates],
  )
  const average = expenses.length ? total / expenses.length : 0
  const activeMembers = members.filter((m) => !m.leftAt).length
  const perMember = activeMembers > 0 ? total / activeMembers : null

  const recurringSplit = useMemo(() => {
    let recurring = 0
    let oneOff = 0
    for (const e of expenses) {
      const amount = toEur(e.amount, e.currency, fxRates)
      if (isServiceRecurring(displayServiceName(e), recurringMap)) recurring += amount
      else oneOff += amount
    }
    return { recurring, oneOff }
  }, [expenses, fxRates, recurringMap])
  const recurringTotal = recurringSplit.recurring + recurringSplit.oneOff
  const recurringPct = recurringTotal > 0 ? (recurringSplit.recurring / recurringTotal) * 100 : 0

  const currenciesUsed = useMemo(() => {
    const set = new Set<string>(['USD', 'GBP'])
    for (const e of expenses) set.add(e.currency.toUpperCase())
    set.delete('EUR')
    return Array.from(set).sort()
  }, [expenses])

  const byService = useMemo(() => {
    const map = new Map<string, { total: number; count: number; color: string; service: ServiceName }>()
    for (const expense of expenses) {
      const name = displayServiceName(expense)
      const entry = map.get(name) ?? { total: 0, count: 0, color: serviceColor(expense.service), service: expense.service }
      entry.total += convert(expense.amount, expense.currency, serviceCurrency, fxRates)
      entry.count += 1
      map.set(name, entry)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [expenses, fxRates, serviceCurrency])
  const byServiceTotal = useMemo(() => byService.reduce((sum, s) => sum + s.total, 0), [byService])
  const byServiceCount = useMemo(() => byService.reduce((sum, s) => sum + s.count, 0), [byService])

  const trend = useMemo(
    () =>
      trendRange === 12
        ? buildMonthlyTrend(expenses, 12, fxRates)
        : buildDailyTrend(expenses, trendRange, fxRates),
    [expenses, trendRange, fxRates],
  )
  const trendMax = Math.max(1, ...trend.map((b) => b.total))

  if (expenses.length === 0) {
    return <div className="empty-state">Sube alguna factura para ver el resumen.</div>
  }

  return (
    <div className="dashboard">
      <div className="stat-row">
        <div className="stat-card stat-card--primary">
          <div className="stat-card__top">
            <span className="stat-card__label">Total</span>
            <span className="stat-card__icon">
              <Wallet size={16} />
            </span>
          </div>
          <span className="stat-card__value">{formatMoneyRound(total, 'EUR')}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">Facturas</span>
            <span className="stat-card__icon" style={{ color: '#2563eb', background: 'rgba(37, 99, 235, 0.14)' }}>
              <Receipt size={16} />
            </span>
          </div>
          <span className="stat-card__value">{expenses.length}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">Gasto medio</span>
            <span className="stat-card__icon" style={{ color: '#7c3aed', background: 'rgba(124, 58, 237, 0.14)' }}>
              <Calculator size={16} />
            </span>
          </div>
          <span className="stat-card__value">{formatMoneyRound(average, 'EUR')}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">Servicios</span>
            <span className="stat-card__icon" style={{ color: '#0d9488', background: 'rgba(13, 148, 136, 0.14)' }}>
              <Layers size={16} />
            </span>
          </div>
          <span className="stat-card__value">{byService.length}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">Gasto ÷ miembros</span>
            <span className="stat-card__icon" style={{ color: '#db2777', background: 'rgba(219, 39, 119, 0.14)' }}>
              <Users size={16} />
            </span>
          </div>
          <span className="stat-card__value">{perMember === null ? '—' : formatMoneyRound(perMember, 'EUR')}</span>
        </div>
      </div>

      <div className="dashboard__grid">
        <section className="panel">
          <div className="panel__header">
            <h3 className="panel__title">Desglose por servicio</h3>
            <div className="panel__header-actions">
              <div className="segmented">
                <button
                  type="button"
                  className={serviceCurrency === 'EUR' ? 'segmented__btn segmented__btn--active' : 'segmented__btn'}
                  onClick={() => setServiceCurrency('EUR')}
                >
                  EUR
                </button>
                <button
                  type="button"
                  className={serviceCurrency === 'USD' ? 'segmented__btn segmented__btn--active' : 'segmented__btn'}
                  onClick={() => setServiceCurrency('USD')}
                >
                  USD
                </button>
              </div>
              <button type="button" className="btn btn--ghost btn--compact" onClick={onOpenMergeModal}>
                <Merge size={14} /> Unificar
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="expense-table">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th className="num">Facturas</th>
                  <th className="num">Gasto medio</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {byService.map((s) => (
                  <tr key={s.name}>
                    <td>
                      <span className="breakdown__label">
                        <span className="breakdown__dot" style={{ background: s.color }} />
                        {s.name}
                      </span>
                    </td>
                    <td className="num">{s.count}</td>
                    <td className="num">{formatMoneyRound(s.total / s.count, serviceCurrency)}</td>
                    <td className="num">{formatMoneyRound(s.total, serviceCurrency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{byServiceCount}</td>
                  <td className="num">
                    {byServiceCount ? formatMoneyRound(byServiceTotal / byServiceCount, serviceCurrency) : '—'}
                  </td>
                  <td className="num">{formatMoneyRound(byServiceTotal, serviceCurrency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <div className="dashboard__side">
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
                <button
                  type="button"
                  className={trendRange === 12 ? 'segmented__btn segmented__btn--active' : 'segmented__btn'}
                  onClick={() => setTrendRange(12)}
                >
                  Por mes
                </button>
              </div>
            </div>
            <div className="trend-chart">
              {trend.map((bucket, i) => (
                <div
                  key={i}
                  className="trend-chart__bar"
                  style={{ height: `${bucket.total ? Math.max(6, (bucket.total / trendMax) * 100) : 2}%` }}
                  title={`${bucket.title}: ${formatMoneyRound(bucket.total, 'EUR')}`}
                />
              ))}
            </div>
            {trendRange === 12 && (
              <div className="trend-chart__labels">
                {trend.map((bucket, i) => (
                  <span key={i}>{bucket.label}</span>
                ))}
              </div>
            )}

            <button type="button" className="btn btn--ghost btn--compact trend-chart__fx" onClick={() => setShowFxModal(true)}>
              <Coins size={13} /> Tipo de cambio
            </button>
          </section>

          <section className="panel dashboard__side-fill">
            <div className="panel__header">
              <h3 className="panel__title">Recurrente vs. puntual</h3>
              <Repeat size={15} className="muted" />
            </div>
            <div className="trend-split">
              <div className="trend-split__values">
                <span className="trend-split__value trend-split__value--recurring">
                  {formatMoneyRound(recurringSplit.recurring, 'EUR')} <span className="muted">recurrente</span>
                </span>
                <span className="trend-split__value trend-split__value--oneoff">
                  {formatMoneyRound(recurringSplit.oneOff, 'EUR')} <span className="muted">puntual</span>
                </span>
              </div>
              <div className="trend-split__bar">
                <div
                  className="trend-split__bar-seg trend-split__bar-seg--recurring"
                  style={{ width: `${recurringPct}%` }}
                />
                <div
                  className="trend-split__bar-seg trend-split__bar-seg--oneoff"
                  style={{ width: `${100 - recurringPct}%` }}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      {showFxModal && (
        <FxRatesModal
          currencies={currenciesUsed}
          rates={fxRates}
          onSave={onSaveFxRates}
          onClose={() => setShowFxModal(false)}
        />
      )}
    </div>
  )
}
