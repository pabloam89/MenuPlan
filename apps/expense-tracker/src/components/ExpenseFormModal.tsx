import { useState, type FormEvent } from 'react'
import { SERVICES, type Expense, type ServiceName } from '../types'

export interface ExpenseFormValues {
  date: string
  amount: number
  currency: string
  service: ServiceName
  customService: string
  description: string
}

interface ExpenseFormModalProps {
  expense: Expense
  onSave: (values: ExpenseFormValues) => void
  onClose: () => void
}

export function ExpenseFormModal({ expense, onSave, onClose }: ExpenseFormModalProps) {
  const [values, setValues] = useState<ExpenseFormValues>({
    date: expense.date,
    amount: expense.amount,
    currency: expense.currency || 'EUR',
    service: expense.service,
    customService: expense.customService ?? '',
    description: expense.description,
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
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
