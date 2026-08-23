import { Search, X } from 'lucide-react'
import { SERVICES } from '../types'

export interface Filters {
  search: string
  service: string // '' = all
  dateFrom: string
  dateTo: string
  amountMin: string
  amountMax: string
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  service: '',
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
}

interface FilterBarProps {
  filters: Filters
  onChange: (filters: Filters) => void
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value })
  }

  const hasActiveFilters = Object.values(filters).some((v) => v !== '')

  return (
    <div className="filter-bar">
      <div className="filter-bar__search">
        <Search size={15} />
        <input
          type="text"
          placeholder="Buscar por descripción o servicio…"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
        />
      </div>

      <select className="input input--compact" value={filters.service} onChange={(e) => set('service', e.target.value)}>
        <option value="">Todos los servicios</option>
        {SERVICES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <div className="filter-bar__range">
        <input
          type="date"
          className="input input--compact"
          value={filters.dateFrom}
          onChange={(e) => set('dateFrom', e.target.value)}
          aria-label="Desde"
        />
        <span>–</span>
        <input
          type="date"
          className="input input--compact"
          value={filters.dateTo}
          onChange={(e) => set('dateTo', e.target.value)}
          aria-label="Hasta"
        />
      </div>

      <div className="filter-bar__range">
        <input
          type="number"
          className="input input--compact input--amount"
          placeholder="Mín. €"
          value={filters.amountMin}
          onChange={(e) => set('amountMin', e.target.value)}
          aria-label="Importe mínimo"
        />
        <span>–</span>
        <input
          type="number"
          className="input input--compact input--amount"
          placeholder="Máx. €"
          value={filters.amountMax}
          onChange={(e) => set('amountMax', e.target.value)}
          aria-label="Importe máximo"
        />
      </div>

      {hasActiveFilters && (
        <button type="button" className="btn btn--ghost btn--compact" onClick={() => onChange(EMPTY_FILTERS)}>
          <X size={14} /> Limpiar
        </button>
      )}
    </div>
  )
}
