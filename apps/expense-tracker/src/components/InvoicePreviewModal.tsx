import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getFile } from '../db'

interface InvoicePreviewModalProps {
  fileId: string
  fileName: string | null
  onClose: () => void
}

export function InvoicePreviewModal({ fileId, fileName, onClose }: InvoicePreviewModalProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [type, setType] = useState<string>('')

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    getFile(fileId).then((stored) => {
      if (cancelled || !stored) return
      objectUrl = URL.createObjectURL(stored.blob)
      setUrl(objectUrl)
      setType(stored.type)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--preview" onClick={(e) => e.stopPropagation()}>
        <div className="modal__preview-header">
          <span>{fileName ?? 'Factura'}</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal__preview-body">
          {!url && <p className="muted">Cargando…</p>}
          {url && type === 'application/pdf' && (
            <embed src={url} type="application/pdf" className="preview-pdf" />
          )}
          {url && type !== 'application/pdf' && (
            <img src={url} alt={fileName ?? 'Factura'} className="preview-image" />
          )}
        </div>
      </div>
    </div>
  )
}
