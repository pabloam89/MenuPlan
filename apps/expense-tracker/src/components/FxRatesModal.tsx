import { useState } from 'react'
import { Coins } from 'lucide-react'
import type { FxRates } from '../utils/currency'

interface FxRatesModalProps {
  currencies: string[] // distinct non-EUR currencies to expose an input for
  rates: FxRates
  onSave: (rates: FxRates) => void
  onClose: () => void
}

export function FxRatesModal({ currencies, rates, onSave, onClose }: FxRatesModalProps) {
  const [draft, setDraft] = useState<FxRates>(rates)

  function setRate(currency: string, value: string) {
    const n = Number(value)
    setDraft((prev) => ({ ...prev, [currency]: Number.isFinite(n) && n > 0 ? n : prev[currency] }))
  }

  function handleSave() {
    onSave(draft)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">
          <Coins size={18} strokeWidth={2} /> Tipo de cambio
        </h2>
        <p className="modal__hint">
          Cuánto vale 1 unidad de cada moneda en EUR. Se usa para sumar y comparar gastos en distintas monedas en el
          resumen — no cambia lo guardado en cada factura.
        </p>

        <div className="fx-rates">
          {currencies.map((currency) => (
            <label className="field" key={currency}>
              <span>1 {currency} =</span>
              <div className="fx-rates__row">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  className="input"
                  value={draft[currency] ?? ''}
                  onChange={(e) => setRate(currency, e.target.value)}
                />
                <span className="muted">EUR</span>
              </div>
            </label>
          ))}
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSave}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
