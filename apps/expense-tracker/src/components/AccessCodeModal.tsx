import { useState } from 'react'
import { KeyRound } from 'lucide-react'

interface AccessCodeModalProps {
  onSubmit: (code: string) => void
  onClose: () => void
}

export function AccessCodeModal({ onSubmit, onClose }: AccessCodeModalProps) {
  const [code, setCode] = useState('')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal__icon">
          <KeyRound size={20} strokeWidth={1.75} />
        </div>
        <h2 className="modal__title">Código de acceso</h2>
        <p className="modal__hint">
          Esta herramienta interna requiere un código para usar la extracción por IA. Pídelo al
          administrador del proyecto.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) onSubmit(code.trim())
          }}
        >
          <input
            type="password"
            className="input"
            placeholder="Código de acceso"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={!code.trim()}>
              Continuar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
