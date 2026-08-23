import { useRef, useState, type DragEvent } from 'react'
import { UploadCloud } from 'lucide-react'

const ACCEPTED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])

interface UploadZoneProps {
  onFilesAdded: (files: File[]) => void
  disabled?: boolean
}

export function UploadZone({ onFilesAdded, disabled }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function acceptFiles(fileList: FileList | null) {
    if (!fileList) return
    const files = Array.from(fileList).filter((f) => ACCEPTED_TYPES.has(f.type))
    if (files.length) onFilesAdded(files)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    acceptFiles(e.dataTransfer.files)
  }

  return (
    <div
      className={`upload-zone${dragging ? ' upload-zone--active' : ''}${disabled ? ' upload-zone--disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click()
      }}
    >
      <UploadCloud size={28} strokeWidth={1.75} />
      <p className="upload-zone__title">Arrastra facturas aquí o haz clic para subir</p>
      <p className="upload-zone__hint">PDF, PNG, JPG, WEBP o GIF · varios archivos a la vez</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => {
          acceptFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
