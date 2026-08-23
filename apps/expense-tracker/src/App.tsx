import { useEffect, useMemo, useState } from 'react'
import { Download, Plus, Receipt } from 'lucide-react'
import { deleteExpense, deleteFile, listExpenses, newId, putExpense, saveFile } from './db'
import { AccessCodeError, extractInvoiceData, setAccessCode } from './api'
import { displayServiceName, type Expense } from './types'
import { todayISO } from './utils/format'
import { downloadTextFile, expensesToCsv } from './utils/csv'
import { buildSampleExpenses } from './utils/sampleData'
import { UploadZone } from './components/UploadZone'
import { InvoiceGallery } from './components/InvoiceGallery'
import { InvoicePreviewModal } from './components/InvoicePreviewModal'
import { ExpenseFormModal, type ExpenseFormValues } from './components/ExpenseFormModal'
import { ExpenseTable } from './components/ExpenseTable'
import { Dashboard } from './components/Dashboard'
import { FilterBar, EMPTY_FILTERS, type Filters } from './components/FilterBar'
import { AccessCodeModal } from './components/AccessCodeModal'

type Tab = 'dashboard' | 'gallery' | 'table'

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
    ...overrides,
  }
}

export default function App() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('gallery')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [previewExpense, setPreviewExpense] = useState<Expense | null>(null)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [pendingRetries, setPendingRetries] = useState<PendingRetry[]>([])
  const [showAccessCodeModal, setShowAccessCodeModal] = useState(false)

  useEffect(() => {
    listExpenses()
      .then(setExpenses)
      .finally(() => setLoading(false))
  }, [])

  function upsertLocal(expense: Expense) {
    setExpenses((prev) => {
      const exists = prev.some((e) => e.id === expense.id)
      return exists ? prev.map((e) => (e.id === expense.id ? expense : e)) : [expense, ...prev]
    })
  }

  async function processExtraction(expense: Expense, file: File) {
    try {
      const result = await extractInvoiceData(file)
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
      void processExtraction(draft, file)
    }
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
      downloadTextFile('gastos-menuplan.csv', expensesToCsv(filteredExpenses), 'text/csv')
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
          <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleExport('csv')}>
            <Download size={14} /> CSV
          </button>
          <button type="button" className="btn btn--ghost btn--compact" onClick={() => handleExport('json')}>
            <Download size={14} /> JSON
          </button>
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
            <button type="button" className="btn btn--ghost btn--compact tabs__add" onClick={handleAddManual}>
              <Plus size={14} /> Gasto manual
            </button>
          </nav>

          {tab !== 'dashboard' && <FilterBar filters={filters} onChange={setFilters} />}

          <p className="muted count-line">
            {filteredExpenses.length} de {expenses.length} gastos
          </p>

          {tab === 'dashboard' && <Dashboard expenses={filteredExpenses} />}
          {tab === 'gallery' && (
            <InvoiceGallery
              expenses={filteredExpenses}
              onPreview={setPreviewExpense}
              onEdit={setEditExpense}
              onDelete={handleDelete}
            />
          )}
          {tab === 'table' && (
            <ExpenseTable
              expenses={filteredExpenses}
              onPreview={setPreviewExpense}
              onEdit={setEditExpense}
              onDelete={handleDelete}
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
        <ExpenseFormModal expense={editExpense} onSave={handleSaveEdit} onClose={() => setEditExpense(null)} />
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
    </div>
  )
}
