import { useMemo, useState } from 'react'
import { Merge } from 'lucide-react'
import { displayServiceName, SERVICES, type Expense, type ServiceName } from '../types'
import { formatMoney } from '../utils/format'
import { toEur, type FxRates } from '../utils/currency'

export interface MergeTarget {
  service: ServiceName
  customService: string | null
}

interface MergeServicesModalProps {
  expenses: Expense[]
  fxRates: FxRates
  onMerge: (sourceNames: Set<string>, target: MergeTarget) => void
  onClose: () => void
}

export function MergeServicesModal({ expenses, fxRates, onMerge, onClose }: MergeServicesModalProps) {
  const groups = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    for (const e of expenses) {
      const name = displayServiceName(e)
      const entry = map.get(name) ?? { count: 0, total: 0 }
      entry.count += 1
      entry.total += toEur(e.amount, e.currency, fxRates)
      map.set(name, entry)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
  }, [expenses, fxRates])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetService, setTargetService] = useState<ServiceName>('Otro')
  const [targetCustom, setTargetCustom] = useState('')

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function handleMerge() {
    if (selected.size < 2) return
    onMerge(selected, {
      service: targetService,
      customService: targetService === 'Otro' ? targetCustom.trim() || Array.from(selected)[0] : null,
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--members" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">
          <Merge size={18} strokeWidth={2} /> Unificar servicios
        </h2>
        <p className="modal__hint">
          Marca dos o más nombres que en realidad son el mismo servicio (p. ej. "Da Vinci Resolve" y "DavinciAI") y
          elige a cuál se quedan asignados todos esos gastos.
        </p>

        <div className="members-list">
          {groups.map((g) => (
            <label className="merge-services__row" key={g.name}>
              <input type="checkbox" checked={selected.has(g.name)} onChange={() => toggle(g.name)} />
              <span className="merge-services__name">{g.name}</span>
              <span className="muted">
                {g.count} · {formatMoney(g.total, 'EUR')}
              </span>
            </label>
          ))}
        </div>

        {selected.size >= 2 && (
          <div className="field">
            <span>Fusionar en</span>
            <select
              className="input"
              value={targetService}
              onChange={(e) => setTargetService(e.target.value as ServiceName)}
            >
              {SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {targetService === 'Otro' && (
              <input
                type="text"
                className="input"
                placeholder="Nombre del servicio"
                value={targetCustom}
                onChange={(e) => setTargetCustom(e.target.value)}
                style={{ marginTop: 8 }}
              />
            )}
          </div>
        )}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn--primary" disabled={selected.size < 2} onClick={handleMerge}>
            Fusionar {selected.size >= 2 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
