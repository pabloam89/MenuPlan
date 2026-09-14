import { useMemo } from 'react'
import { Merge } from 'lucide-react'
import { displayServiceName, type Expense } from '../types'
import { formatMoneyRound } from '../utils/format'
import { toEur, type FxRates } from '../utils/currency'
import { isServiceRecurring, type RecurringMap } from '../utils/serviceSettings'
import { serviceColor } from './ServiceBadge'

interface ServicesTabProps {
  expenses: Expense[]
  fxRates: FxRates
  recurringMap: RecurringMap
  onToggleRecurring: (serviceName: string, recurring: boolean) => void
  onMergeServices: () => void
}

export function ServicesTab({ expenses, fxRates, recurringMap, onToggleRecurring, onMergeServices }: ServicesTabProps) {
  const services = useMemo(() => {
    const map = new Map<string, { total: number; count: number; color: string }>()
    for (const expense of expenses) {
      const name = displayServiceName(expense)
      const entry = map.get(name) ?? { total: 0, count: 0, color: serviceColor(expense.service) }
      entry.total += toEur(expense.amount, expense.currency, fxRates)
      entry.count += 1
      map.set(name, entry)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [expenses, fxRates])

  if (services.length === 0) {
    return <div className="empty-state">Aún no hay servicios — sube alguna factura primero.</div>
  }

  return (
    <div className="panel">
      <div className="panel__header">
        <h3 className="panel__title">Servicios</h3>
        <button type="button" className="btn btn--ghost btn--compact" onClick={onMergeServices}>
          <Merge size={14} /> Unificar
        </button>
      </div>
      <p className="modal__hint">
        Marca qué servicios son suscripciones recurrentes y cuáles son compras puntuales. Se aplica a todas las
        facturas de ese servicio, pasadas y futuras.
      </p>

      <div className="table-wrap">
        <table className="expense-table expense-table--center">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Facturas</th>
              <th>Total (EUR)</th>
              <th>Recurrente</th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => {
              const recurring = isServiceRecurring(s.name, recurringMap)
              return (
                <tr key={s.name}>
                  <td>
                    <span className="breakdown__label">
                      <span className="breakdown__dot" style={{ background: s.color }} />
                      {s.name}
                    </span>
                  </td>
                  <td>{s.count}</td>
                  <td>{formatMoneyRound(s.total, 'EUR')}</td>
                  <td>
                    <label className="switch-cell">
                      <span className={recurring ? 'switch-cell__label switch-cell__label--on' : 'switch-cell__label'}>
                        {recurring ? 'Recurrente' : 'Puntual'}
                      </span>
                      <span className="switch">
                        <input
                          type="checkbox"
                          checked={recurring}
                          onChange={(e) => onToggleRecurring(s.name, e.target.checked)}
                        />
                        <span className="switch__track">
                          <span className="switch__thumb" />
                        </span>
                      </span>
                    </label>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
