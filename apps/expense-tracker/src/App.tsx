import { useEffect, useMemo, useState } from 'react'
import { Download, Plus, Receipt, Trash2, Users } from 'lucide-react'
import {
  clearAll,
  deleteExpense,
  deleteFile,
  deleteMember,
  listExpenses,
  listMembers,
  newId,
  putExpense,
  putMember,
  saveFile,
} from './db'
import { AccessCodeError, ExtractError, extractInvoiceData, setAccessCode } from './api'
import { displayServiceName, type Expense, type Member } from './types'
import { todayISO } from './utils/format'
import { downloadTextFile, expensesToCsv } from './utils/csv'
import { buildSampleExpenses } from './utils/sampleData'
import { loadFxRates, saveFxRates, type FxRates } from './utils/currency'
import { loadRecurringMap, saveRecurringMap, type RecurringMap } from './utils/serviceSettings'
import { UploadZone } from './components/UploadZone'
import { InvoiceGallery } from './components/InvoiceGallery'
import { InvoicePreviewModal } from './components/InvoicePreviewModal'
import { ExpenseFormModal, type ExpenseFormValues } from './components/ExpenseFormModal'
import { ExpenseTable } from './components/ExpenseTable'
import { Dashboard } from './components/Dashboard'
import { FilterBar, EMPTY_FILTERS, type Filters } from './components/FilterBar'
import { AccessCodeModal } from './components/AccessCodeModal'
import { MembersModal } from './components/MembersModal'
import { MergeServicesModal, type MergeTarget } from './components/MergeServicesModal'
import { ServicesTab } from './components/ServicesTab'
import { BalancesTab } from './components/BalancesTab'

type Tab = 'dashboard' | 'gallery' | 'table' | 'services' | 'balances'

// Anthropic rate-limits/overloads a low-tier key well before 50 concurrent
// requests finish, so subida masiva needs both a concurrency cap and retries
// on the transient statuses (429 rate limit, 529 overloaded) — see
// api.ts#ExtractError.
const MAX_CONCURRENT_EXTRACTIONS = 4
const MAX_RETRIES = 4

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function extractWithRetry(file: File) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await extractInvoiceData(file)
    } catch (err) {
      const retryable = err instanceof ExtractError && (err.status === 429 || err.status === 529)
      if (!retryable || attempt >= MAX_RETRIES) throw err
      await sleep(attempt * 1500)
    }
  }
}

interface PendingRetry {
  expense: Expense
  file: File
}

function makeDraft(overrides: Partial<Expense>): Expense {
  return {
    id: newId(),
    fileId: null,
    fileName: null,
    fileType: null,
    date: todayISO(),
    amount: 0,
    currency: 'EUR',
    service: 'Otro',
    customService: null,
    description: '',
    createdAt: new Date().toISOString(),
    status: 'manual',
    errorMessage: null,
    memberId: null,
    settledBy: [],
    ...overrides,
  }
}

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('gallery')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [previewExpense, setPreviewExpense] = useState<Expense | null>(null)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [pendingRetries, setPendingRetries] = useState<PendingRetry[]>([])
  const [showAccessCodeModal, setShowAccessCodeModal] = useState(false)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [fxRates, setFxRates] = useState<FxRates>(() => loadFxRates())
  const [recurringMap, setRecurringMap] = useState<RecurringMap>(() => loadRecurringMap())

  useEffect(() => {
    listExpenses()
      .then(setExpenses)
      .finally(() => setLoading(false))
    listMembers().then(setMembers)
  }, [])

  function upsertLocal(expense: Expense) {
    setExpenses((prev) => {
      const exists = prev.some((e) => e.id === expense.id)
      return exists ? prev.map((e) => (e.id === expense.id ? expense : e)) : [expense, ...prev]
    })
  }

  async function processExtraction(expense: Expense, file: File) {
    try {
      const result = await extractWithRetry(file)
      const updated: Expense = {
        ...expense,
        date: result.date ?? expense.date,
        amount: result.amount ?? expense.amount,
        currency: result.currency ?? expense.currency,
        service: result.service ?? expense.service,
        customService: result.service === 'Otro' ? result.customService : null,
        description: result.description ?? expense.description,
        status: 'done',
        errorMessage: null,
      }
      await putExpense(updated)
      upsertLocal(updated)
    } catch (err) {
      if (err instanceof AccessCodeError) {
        setPendingRetries((prev) => [...prev, { expense, file }])
        setShowAccessCodeModal(true)
        const updated: Expense = { ...expense, status: 'error', errorMessage: 'Código de acceso requerido' }
        await putExpense(updated)
        upsertLocal(updated)
        return
      }
      const message = err instanceof Error ? err.message : 'Error desconocido'
      const updated: Expense = { ...expense, status: 'error', errorMessage: message }
      await putExpense(updated)
      upsertLocal(updated)
    }
  }

  async function handleFilesAdded(files: File[]) {
    const queue: { draft: Expense; file: File }[] = []
    for (const file of files) {
      const id = newId()
      const draft = makeDraft({
        id,
        fileId: id,
        fileName: file.name,
        fileType: file.type || null,
        status: 'processing',
      })
      await saveFile(id, file, file.name)
      await putExpense(draft)
      upsertLocal(draft)
      queue.push({ draft, file })
    }

    // Fixed-size worker pool instead of firing every extraction at once —
    // see MAX_CONCURRENT_EXTRACTIONS above for why.
    let next = 0
    async function worker() {
      while (next < queue.length) {
        const item = queue[next++]
        await processExtraction(item.draft, item.file)
      }
    }
    const workerCount = Math.min(MAX_CONCURRENT_EXTRACTIONS, queue.length)
    void Promise.all(Array.from({ length: workerCount }, worker))
  }

  function handleAccessCodeSubmit(code: string) {
    setAccessCode(code)
    setShowAccessCodeModal(false)
    const retries = pendingRetries
    setPendingRetries([])
    for (const { expense, file } of retries) {
      const reset: Expense = { ...expense, status: 'processing', errorMessage: null }
      upsertLocal(reset)
      void putExpense(reset)
      void processExtraction(reset, file)
    }
  }

  async function handleDelete(expense: Expense) {
    const label = expense.description || displayServiceName(expense)
    if (!window.confirm(`¿Eliminar el gasto "${label}"? Esta acción no se puede deshacer.`)) return
    await deleteExpense(expense.id)
    if (expense.fileId) await deleteFile(expense.fileId)
    setExpenses((prev) => prev.filter((e) => e.id !== expense.id))
  }

  async function handleChangePayer(expense: Expense, memberId: string | null) {
    const updated: Expense = { ...expense, memberId }
    await putExpense(updated)
    upsertLocal(updated)
  }

  async function handleBulkAssignPayer(memberId: string) {
    if (!memberId || filteredExpenses.length === 0) return
    const member = members.find((m) => m.id === memberId)
    if (
      !window.confirm(
        `¿Asignar los ${filteredExpenses.length} gastos visibles a ${member?.name || 'este miembro'}? Se sobrescribirá quién pagó cada uno.`,
      )
    )
      return
    await Promise.all(filteredExpenses.map((expense) => handleChangePayer(expense, memberId)))
  }

  async function handleToggleSettled(expense: Expense, memberId: string) {
    const current = expense.settledBy ?? []
    const next = current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]
    const updated: Expense = { ...expense, settledBy: next }
    await putExpense(updated)
    upsertLocal(updated)
  }

  async function handleClearAll() {
    if (expenses.length === 0) return
    if (
      !window.confirm(
        `¿Vaciar todo? Se eliminarán los ${expenses.length} gastos y sus facturas. Esta acción no se puede deshacer.`,
      )
    )
      return
    await clearAll()
    setExpenses([])
  }

  async function handleSaveMember(member: Member) {
    await putMember(member)
    setMembers((prev) => {
      const exists = prev.some((m) => m.id === member.id)
      return exists ? prev.map((m) => (m.id === member.id ? member : m)) : [...prev, member]
    })
  }

  async function handleDeleteMember(member: Member) {
    await deleteMember(member.id)
    setMembers((prev) => prev.filter((m) => m.id !== member.id))
    // Un-assign this member's expenses instead of leaving a dangling memberId
    // that would silently resolve to "no name" everywhere it's displayed.
    const affected = expenses.filter((e) => e.memberId === member.id)
    for (const expense of affected) {
      const updated: Expense = { ...expense, memberId: null }
      await putExpense(updated)
      upsertLocal(updated)
    }
  }

  function handleSaveFxRates(rates: FxRates) {
    saveFxRates(rates)
    setFxRates(rates)
  }

  function handleToggleRecurring(serviceName: string, recurring: boolean) {
    setRecurringMap((prev) => {
      const next = { ...prev, [serviceName]: recurring }
      saveRecurringMap(next)
      return next
    })
  }

  async function handleMergeServices(sourceNames: Set<string>, target: MergeTarget) {
    const affected = expenses.filter((e) => sourceNames.has(displayServiceName(e)))
    for (const expense of affected) {
      const updated: Expense = {
        ...expense,
        service: target.service,
        customService: target.service === 'Otro' ? target.customService : null,
      }
      await putExpense(updated)
      upsertLocal(updated)
    }
  }

  async function handleSaveEdit(values: ExpenseFormValues) {
    if (!editExpense) return
    const updated: Expense = {
      ...editExpense,
      ...values,
      customService: values.service === 'Otro' ? values.customService || null : null,
      status: editExpense.status === 'processing' ? 'processing' : 'manual',
    }
    await putExpense(updated)
    upsertLocal(updated)
    setEditExpense(null)
  }

  async function handleAddManual() {
    const draft = makeDraft({})
    await putExpense(draft)
    upsertLocal(draft)
    setEditExpense(draft)
  }

  async function handleLoadSamples() {
    const samples = buildSampleExpenses()
    for (const sample of samples) await putExpense(sample)
    setExpenses((prev) => [...samples, ...prev])
  }

  const filteredExpenses = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    const min = filters.amountMin === '' ? null : Number(filters.amountMin)
    const max = filters.amountMax === '' ? null : Number(filters.amountMax)
    return expenses.filter((e) => {
      if (filters.service && e.service !== filters.service) return false
      if (filters.memberId && e.memberId !== filters.memberId) return false
      if (filters.dateFrom && e.date < filters.dateFrom) return false
      if (filters.dateTo && e.date > filters.dateTo) return false
      if (min !== null && e.amount < min) return false
      if (max !== null && e.amount > max) return false
      if (search) {
        const haystack = `${e.description} ${displayServiceName(e)} ${e.fileName ?? ''}`.toLowerCase()
        if (!haystack.includes(search)) return false
      }
      return true
    })
  }, [expenses, filters])

  function handleExport(format: 'csv' | 'json') {
    if (format === 'csv') {
      downloadTextFile(
        'gastos-menuplan.csv',
        expensesToCsv(filteredExpenses, members, fxRates, recurringMap),
        'text/csv',
      )
    } else {
      downloadTextFile('gastos-menuplan.json', JSON.stringify(filteredExpenses, null, 2), 'application/json')
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title">
          <Receipt size={22} strokeWidth={1.75} />
          <div>
            <h1>Gastos</h1>
            <p className="muted">Registro interno de facturas y suscripciones de MenuPlan</p>
          </div>
        </div>
        <div className="app__header-actions">
          <button type="button" className="btn btn--ghost btn--compact" onClick={() => setShowMembersModal(true)}>
            <Users size={14} /> Miembros ({members.filter((m) => !m.leftAt).length})
          </button>
          <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleExport('csv')}>
            <Download size={14} /> CSV
          </button>
          <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleExport('json')}>
            <Download size={14} /> JSON
          </button>
          {expenses.length > 0 && (
            <button type="button" className="btn btn--ghost btn--compact" onClick={handleClearAll}>
              <Trash2 size={14} /> Vaciar todo
            </button>
          )}
        </div>
      </header>

      <UploadZone onFilesAdded={handleFilesAdded} />

      {loading && <p className="muted">Cargando…</p>}

      {!loading && expenses.length === 0 && (
        <div className="empty-state empty-state--big">
          <p>Aún no hay gastos registrados.</p>
          <div className="empty-state__actions">
            <button type="button" className="btn btn--ghost" onClick={handleAddManual}>
              <Plus size={15} /> Añadir gasto manual
            </button>
            <button type="button" className="btn btn--ghost" onClick={handleLoadSamples}>
              Cargar ejemplos de demostración
            </button>
          </div>
        </div>
      )}

      {!loading && expenses.length > 0 && (
        <>
          <nav className="tabs">
            <button
              type="button"
              className={tab === 'dashboard' ? 'tabs__btn tabs__btn--active' : 'tabs__btn'}
              onClick={() => setTab('dashboard')}
            >
              Resumen
            </button>
            <button
              type="button"
              className={tab === 'gallery' ? 'tabs__btn tabs__btn--active' : 'tabs__btn'}
              onClick={() => setTab('gallery')}
            >
              Galería
            </button>
            <button
              type="button"
              className={tab === 'table' ? 'tabs__btn tabs__btn--active' : 'tabs__btn'}
              onClick={() => setTab('table')}
            >
              Tabla
            </button>
            <button
              type="button"
              className={tab === 'services' ? 'tabs__btn tabs__btn--active' : 'tabs__btn'}
              onClick={() => setTab('services')}
            >
              Servicios
            </button>
            <button
              type="button"
              className={tab === 'balances' ? 'tabs__btn tabs__btn--active' : 'tabs__btn'}
              onClick={() => setTab('balances')}
            >
              Balances
            </button>
            <button type="button" className="btn btn--ghost btn--compact tabs__add" onClick={handleAddManual}>
              <Plus size={14} /> Gasto manual
            </button>
          </nav>

          {tab !== 'dashboard' && tab !== 'services' && tab !== 'balances' && (
            <FilterBar filters={filters} members={members} onChange={setFilters} />
          )}

          {tab !== 'services' && tab !== 'balances' && (
            <p className="muted count-line">
              {filteredExpenses.length} de {expenses.length} gastos
            </p>
          )}

          {tab === 'dashboard' && (
            <Dashboard
              expenses={filteredExpenses}
              members={members}
              fxRates={fxRates}
              recurringMap={recurringMap}
              onSaveFxRates={handleSaveFxRates}
              onOpenMergeModal={() => setShowMergeModal(true)}
            />
          )}
          {tab === 'services' && (
            <ServicesTab
              expenses={expenses}
              fxRates={fxRates}
              recurringMap={recurringMap}
              onToggleRecurring={handleToggleRecurring}
              onMergeServices={() => setShowMergeModal(true)}
            />
          )}
          {tab === 'balances' && <BalancesTab expenses={expenses} members={members} fxRates={fxRates} />}
          {tab === 'gallery' && (
            <InvoiceGallery
              expenses={filteredExpenses}
              members={members}
              onPreview={setPreviewExpense}
              onEdit={setEditExpense}
              onDelete={handleDelete}
            />
          )}
          {tab === 'table' && (
            <ExpenseTable
              expenses={filteredExpenses}
              members={members}
              onPreview={setPreviewExpense}
              onDelete={handleDelete}
              onChangePayer={handleChangePayer}
              onToggleSettled={handleToggleSettled}
              onBulkAssignPayer={handleBulkAssignPayer}
            />
          )}
        </>
      )}

      {previewExpense?.fileId && (
        <InvoicePreviewModal
          fileId={previewExpense.fileId}
          fileName={previewExpense.fileName}
          onClose={() => setPreviewExpense(null)}
        />
      )}

      {editExpense && (
        <ExpenseFormModal
          expense={editExpense}
          members={members}
          fxRates={fxRates}
          onSave={handleSaveEdit}
          onClose={() => setEditExpense(null)}
        />
      )}

      {showAccessCodeModal && (
        <AccessCodeModal
          onSubmit={handleAccessCodeSubmit}
          onClose={() => {
            setShowAccessCodeModal(false)
            setPendingRetries([])
          }}
        />
      )}

      {showMembersModal && (
        <MembersModal
          members={members}
          onSave={handleSaveMember}
          onDelete={handleDeleteMember}
          onClose={() => setShowMembersModal(false)}
        />
      )}

      {showMergeModal && (
        <MergeServicesModal
          expenses={expenses}
          fxRates={fxRates}
          onMerge={handleMergeServices}
          onClose={() => setShowMergeModal(false)}
        />
      )}
    </div>
  )
}
