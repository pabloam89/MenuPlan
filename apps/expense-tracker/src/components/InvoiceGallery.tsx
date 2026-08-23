import { Inbox } from 'lucide-react'
import type { Expense } from '../types'
import { InvoiceCard } from './InvoiceCard'

interface InvoiceGalleryProps {
  expenses: Expense[]
  onPreview: (expense: Expense) => void
  onEdit: (expense: Expense) => void
  onDelete: (expense: Expense) => void
}

export function InvoiceGallery({ expenses, onPreview, onEdit, onDelete }: InvoiceGalleryProps) {
  if (expenses.length === 0) {
    return (
      <div className="empty-state">
        <Inbox size={32} strokeWidth={1.25} />
        <p>No hay gastos que coincidan con los filtros.</p>
      </div>
    )
  }

  return (
    <div className="invoice-gallery">
      {expenses.map((expense) => (
        <InvoiceCard
          key={expense.id}
          expense={expense}
          onPreview={() => onPreview(expense)}
          onEdit={() => onEdit(expense)}
          onDelete={() => onDelete(expense)}
        />
      ))}
    </div>
  )
}
