import { useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, Pencil, Trash2, Eye, Inbox } from 'lucide-react'
import { displayServiceName, type Expense } from '../types'
import { formatDate, formatMoney } from '../utils/format'
import { ServiceBadge } from './ServiceBadge'

type SortKey = 'date' | 'service' | 'amount' | 'description'

interface ExpenseTableProps {
  expenses: Expense[]
  onPreview: (expense: Expense) => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
}

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'date', label: 'Fecha' },
  { key: 'service', label: 'Servicio' },
  { key: 'amount', label: 'Importe' },
  { key: 'description', label: 'Descripción' },
]

export function ExpenseTable({ expenses, onPreview, onEdit, onDelete }: ExpenseTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const copy = [...expenses]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'amount') cmp = a.amount - b.amount
      else if (sortKey === 'service') cmp = displayServiceName(a).localeCompare(displayServiceName(b))
      else if (sortKey === 'description') cmp = a.description.localeCompare(b.description)
      else cmp = a.date.localeCompare(b.date)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [expenses, sortKey, sortDir])

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
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((expense) => (
            <tr key={expense.id}>
              <td>{formatDate(expense.date)}</td>
              <td>
                <ServiceBadge expense={expense} />
              </td>
              <td className="num">{formatMoney(expense.amount, expense.currency)}</td>
              <td className="ellipsis" title={expense.description}>
                {expense.description || '—'}
              </td>
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
                  <button type="button" className="icon-btn" onClick={() => onEdit(expense)} aria-label="Editar">
                    <Pencil size={15} />
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
          ))}
        </tbody>
      </table>
    </div>
  )
}
