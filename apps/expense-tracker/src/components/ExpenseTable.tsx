import { useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, Trash2, Eye, Inbox } from 'lucide-react'
import {
  activeMemberCount,
  displayServiceName,
  memberName,
  perHeadAmount,
  settledByOf,
  type Expense,
  type Member,
} from '../types'
import { formatDate, formatMoney, initials } from '../utils/format'
import { ServiceBadge } from './ServiceBadge'

type SortKey = 'date' | 'service' | 'member' | 'amount'

interface ExpenseTableProps {
  expenses: Expense[]
  members: Member[]
  onPreview: (expense: Expense) => void
  onDelete: (expense: Expense) => void
  onChangePayer: (expense: Expense, memberId: string | null) => void
  onToggleSettled: (expense: Expense, memberId: string) => void
  onBulkAssignPayer: (memberId: string) => void
}

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'date', label: 'Fecha' },
  { key: 'service', label: 'Servicio' },
  { key: 'member', label: 'Pagado por' },
  { key: 'amount', label: 'Importe' },
]

export function ExpenseTable({
  expenses,
  members,
  onPreview,
  onDelete,
  onChangePayer,
  onToggleSettled,
  onBulkAssignPayer,
}: ExpenseTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [bulkMemberId, setBulkMemberId] = useState('')
  const activeCount = activeMemberCount(members)

  const sorted = useMemo(() => {
    const copy = [...expenses]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'amount') cmp = a.amount - b.amount
      else if (sortKey === 'service') cmp = displayServiceName(a).localeCompare(displayServiceName(b))
      else if (sortKey === 'member') cmp = memberName(members, a.memberId).localeCompare(memberName(members, b.memberId))
      else cmp = a.date.localeCompare(b.date)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [expenses, members, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (expenses.length === 0) {
    return (
      <div className="empty-state">
        <Inbox size={32} strokeWidth={1.25} />
        <p>No hay gastos que coincidan con los filtros.</p>
      </div>
    )
  }

  return (
    <>
      <div className="bulk-assign">
        <span className="bulk-assign__label">Asignar todas a:</span>
        <select
          className="input input--compact"
          value={bulkMemberId}
          onChange={(e) => setBulkMemberId(e.target.value)}
        >
          <option value="">Elige quién pagó…</option>
          {members
            .filter((m) => !m.leftAt)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || 'Sin nombre'}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          disabled={!bulkMemberId}
          onClick={() => {
            onBulkAssignPayer(bulkMemberId)
            setBulkMemberId('')
          }}
        >
          Aplicar a los {expenses.length} gastos visibles
        </button>
      </div>
      <div className="table-wrap">
      <table className="expense-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key}>
                <button type="button" className="th-sort" onClick={() => toggleSort(col.key)}>
                  {col.label}
                  {sortKey === col.key ? (
                    sortDir === 'asc' ? (
                      <ArrowUp size={13} />
                    ) : (
                      <ArrowDown size={13} />
                    )
                  ) : (
                    <ArrowUpDown size={13} className="th-sort__idle" />
                  )}
                </button>
              </th>
            ))}
            {activeCount > 1 && (
              <>
                <th>Por cabeza</th>
                <th>Saldado por</th>
              </>
            )}
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((expense) => {
            const settled = settledByOf(expense)
            const others = members.filter((m) => !m.leftAt && m.id !== expense.memberId)
            return (
              <tr key={expense.id}>
                <td>{formatDate(expense.date)}</td>
                <td>
                  <ServiceBadge expense={expense} />
                </td>
                <td>
                  <select
                    className="input input--compact table-select"
                    value={expense.memberId ?? ''}
                    onChange={(e) => onChangePayer(expense, e.target.value || null)}
                  >
                    <option value="">Sin asignar</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || 'Sin nombre'}
                        {m.leftAt ? ' (baja)' : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">{formatMoney(expense.amount, expense.currency)}</td>
                {activeCount > 1 && (
                  <>
                    <td className="num">{formatMoney(perHeadAmount(expense.amount, members) ?? 0, expense.currency)}</td>
                    <td className="center">
                      {expense.memberId ? (
                        <div className="avatar-chip-group">
                          {others.map((m) => {
                            const isSettled = settled.includes(m.id)
                            return (
                              <button
                                key={m.id}
                                type="button"
                                className={isSettled ? 'avatar-chip avatar-chip--settled' : 'avatar-chip'}
                                title={`${m.name || 'Sin nombre'} — ${isSettled ? 'ya ha saldado su parte' : 'pendiente, clic para marcar como saldado'}`}
                                onClick={() => onToggleSettled(expense, m.id)}
                              >
                                {initials(m.name || '?')}
                              </button>
                            )
                          })}
                          {others.length === 0 && <span className="muted">—</span>}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </>
                )}
                <td>
                  <div className="table-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => onPreview(expense)}
                      disabled={!expense.fileId}
                      aria-label="Ver"
                    >
                      <Eye size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger"
                      onClick={() => onDelete(expense)}
                      aria-label="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </>
  )
}
