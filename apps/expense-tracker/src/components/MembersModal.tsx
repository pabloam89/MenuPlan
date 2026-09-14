import { Plus, Trash2, Users } from 'lucide-react'
import { newId } from '../db'
import type { Member } from '../types'
import { todayISO } from '../utils/format'

// The team/tracker started in April 2026 — offered as a one-click default so
// founding members don't need to remember or type the exact date.
const PROJECT_START = '2026-04-01'

interface MembersModalProps {
  members: Member[]
  onSave: (member: Member) => void
  onDelete: (member: Member) => void
  onClose: () => void
}

export function MembersModal({ members, onSave, onDelete, onClose }: MembersModalProps) {
  const activeCount = members.filter((m) => !m.leftAt).length

  function addMember() {
    onSave({ id: newId(), name: '', since: todayISO(), leftAt: null })
  }

  function handleDelete(member: Member) {
    const label = member.name || 'este miembro'
    if (!window.confirm(`¿Eliminar a "${label}"? Los gastos que tuviera asignados quedarán sin asignar.`)) return
    onDelete(member)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--members" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal__title">
          <Users size={18} strokeWidth={2} /> Miembros
        </h2>
        <p className="modal__hint">
          {activeCount} {activeCount === 1 ? 'miembro activo' : 'miembros activos'}
          {members.length !== activeCount ? ` de ${members.length} en total` : ''}
        </p>

        {members.length > 0 && (
          <div className="members-list">
            {members.map((member) => (
              <div className="members-list__row" key={member.id}>
                <div className="members-list__row-top">
                  <input
                    type="text"
                    className="input"
                    placeholder="Nombre"
                    value={member.name}
                    onChange={(e) => onSave({ ...member, name: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    onClick={() => handleDelete(member)}
                    aria-label="Eliminar miembro"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="members-list__fields">
                  <div className="members-list__field">
                    <span>Desde</span>
                    <div className="members-list__field-row">
                      <input
                        type="date"
                        className="input input--compact"
                        value={member.since}
                        onChange={(e) => onSave({ ...member, since: e.target.value })}
                      />
                      {member.since !== PROJECT_START && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--compact"
                          onClick={() => onSave({ ...member, since: PROJECT_START })}
                        >
                          Desde el inicio
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="members-list__field">
                    <span>Baja</span>
                    <div className="members-list__field-row">
                      <label className="members-list__active-toggle">
                        <input
                          type="checkbox"
                          checked={!member.leftAt}
                          onChange={(e) => onSave({ ...member, leftAt: e.target.checked ? null : todayISO() })}
                        />
                        Sigue de alta (actualidad)
                      </label>
                      {member.leftAt !== null && (
                        <input
                          type="date"
                          className="input input--compact"
                          value={member.leftAt}
                          onChange={(e) => onSave({ ...member, leftAt: e.target.value || todayISO() })}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button type="button" className="btn btn--ghost btn--compact members-list__add" onClick={addMember}>
          <Plus size={14} /> Añadir miembro
        </button>

        <div className="modal__actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
