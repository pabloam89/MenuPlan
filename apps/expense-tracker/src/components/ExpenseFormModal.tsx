import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { FileText, Paperclip } from 'lucide-react'
import { newId, saveFile } from '../db'
import { SERVICES, type Expense, type Member, type ServiceName } from '../types'
import { rateFor, toEur, type FxRates } from '../utils/currency'

export interface ExpenseFormValues {
  date: string
  amount: number
  currency: string
  service: ServiceName
  customService: string
  description: string
  memberId: string | null
  fileId: string | null
  fileName: string | null
  fileType: string | null
}

interface ExpenseFormModalProps {
  expense: Expense
  members: Member[]
  fxRates: FxRates
  onSave: (values: ExpenseFormValues) => void
  onClose: () => void
}

export function ExpenseFormModal({ expense, members, fxRates, onSave, onClose }: ExpenseFormModalProps) {
  const [values, setValues] = useState<ExpenseFormValues>({
    date: expense.date,
    amount: expense.amount,
    currency: expense.currency || 'EUR',
    service: expense.service,
    customService: expense.customService ?? '',
    description: expense.description,
    memberId: expense.memberId,
    fileId: expense.fileId,
    fileName: expense.fileName,
    fileType: expense.fileType,
  })
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function convertToEur() {
    const converted = Math.round(toEur(values.amount, values.currency, fxRates) * 100) / 100
    setValues((v) => ({ ...v, amount: converted, currency: 'EUR' }))
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPendingFile(file)
    setValues((v) => ({ ...v, fileId: v.fileId ?? newId(), fileName: file.name, fileType: file.type || null }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (pendingFile && values.fileId) {
      await saveFile(values.fileId, pendingFile, values.fileName ?? pendingFile.name)
    }
    onSave(values)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">Editar gasto</h2>
        <form onSubmit={handleSubmit} className="expense-form">
          <label className="field">
            <span>Fecha</span>
            <input
              type="date"
              className="input"
              value={values.date}
              onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
              required
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Importe</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={values.amount}
                onChange={(e) => setValues((v) => ({ ...v, amount: Number(e.target.value) }))}
                required
              />
            </label>
            <label className="field field--small">
              <span>Moneda</span>
              <input
                type="text"
                className="input"
                maxLength={3}
                value={values.currency}
                onChange={(e) => setValues((v) => ({ ...v, currency: e.target.value.toUpperCase() }))}
                required
              />
            </label>
          </div>

          {values.currency !== 'EUR' && (
            <button type="button" className="btn btn--ghost btn--compact" onClick={convertToEur}>
              Convertir a EUR (1 {values.currency} = {rateFor(values.currency, fxRates)} EUR) → €
              {(Math.round(toEur(values.amount, values.currency, fxRates) * 100) / 100).toFixed(2)}
            </button>
          )}

          <label className="field">
            <span>Servicio</span>
            <select
              className="input"
              value={values.service}
              onChange={(e) => setValues((v) => ({ ...v, service: e.target.value as ServiceName }))}
            >
              {SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {values.service === 'Otro' && (
            <label className="field">
              <span>Nombre del servicio</span>
              <input
                type="text"
                className="input"
                placeholder="Ej. Figma, Notion…"
                value={values.customService}
                onChange={(e) => setValues((v) => ({ ...v, customService: e.target.value }))}
              />
            </label>
          )}

          <label className="field">
            <span>Pagado por</span>
            <select
              className="input"
              value={values.memberId ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, memberId: e.target.value || null }))}
            >
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || 'Sin nombre'}
                  {m.leftAt ? ' (baja)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Factura</span>
            <div className="attach-file">
              {values.fileName ? (
                <span className="attach-file__current">
                  <FileText size={14} /> {values.fileName}
                </span>
              ) : (
                <span className="attach-file__current attach-file__current--empty">Sin factura adjunta</span>
              )}
              <button type="button" className="btn btn--ghost btn--compact" onClick={() => fileInputRef.current?.click()}>
                <Paperclip size={13} /> {values.fileName ? 'Reemplazar' : 'Adjuntar'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>
          </label>

          <label className="field">
            <span>Descripción</span>
            <textarea
              className="input"
              rows={2}
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            />
          </label>

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary">
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
