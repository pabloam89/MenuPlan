import { useEffect, useState } from 'react'
import { FileText, Image as ImageIcon, Loader2, AlertTriangle, Pencil, Trash2, Eye } from 'lucide-react'
import { getFile } from '../db'
import { displayServiceName, type Expense } from '../types'
import { formatDate, formatMoney } from '../utils/format'
import { ServiceBadge } from './ServiceBadge'

interface InvoiceCardProps {
  expense: Expense
  onPreview: () => void
  onEdit: () => void
  onDelete: () => void
}

export function InvoiceCard({ expense, onPreview, onEdit, onDelete }: InvoiceCardProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const isPdf = expense.fileType === 'application/pdf'

  useEffect(() => {
    if (!expense.fileId || isPdf) return
    let objectUrl: string | null = null
    let cancelled = false
    getFile(expense.fileId).then((stored) => {
      if (cancelled || !stored) return
      objectUrl = URL.createObjectURL(stored.blob)
      setThumbUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [expense.fileId, isPdf])

  return (
    <div className="invoice-card">
      <button
        type="button"
        className="invoice-card__thumb"
        onClick={onPreview}
        disabled={!expense.fileId}
        aria-label="Ver factura"
      >
        {thumbUrl && <img src={thumbUrl} alt="" />}
        {!thumbUrl && isPdf && <FileText size={32} strokeWidth={1.25} />}
        {!thumbUrl && !isPdf && !expense.fileId && <ImageIcon size={32} strokeWidth={1.25} />}
        {expense.status === 'processing' && (
          <span className="invoice-card__status invoice-card__status--processing">
            <Loader2 size={14} className="spin" /> Leyendo…
          </span>
        )}
        {expense.status === 'error' && (
          <span className="invoice-card__status invoice-card__status--error">
            <AlertTriangle size={14} /> Error
          </span>
        )}
      </button>

      <div className="invoice-card__body">
        <div className="invoice-card__top">
          <ServiceBadge expense={expense} />
          <span className="invoice-card__amount">{formatMoney(expense.amount, expense.currency)}</span>
        </div>
        <p className="invoice-card__desc" title={expense.description}>
          {expense.description || displayServiceName(expense)}
        </p>
        <p className="invoice-card__date">{formatDate(expense.date)}</p>
      </div>

      <div className="invoice-card__actions">
        <button type="button" className="icon-btn" onClick={onPreview} disabled={!expense.fileId} aria-label="Ver">
          <Eye size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={onEdit} aria-label="Editar">
          <Pencil size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn--danger" onClick={onDelete} aria-label="Eliminar">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}
