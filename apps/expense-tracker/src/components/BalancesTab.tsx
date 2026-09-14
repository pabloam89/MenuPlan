import { useMemo } from 'react'
import { ArrowRight, Scale } from 'lucide-react'
import type { Expense, Member } from '../types'
import { formatMoneyRound } from '../utils/format'
import { toEur, type FxRates } from '../utils/currency'

interface BalancesTabProps {
  expenses: Expense[]
  members: Member[]
  fxRates: FxRates
}

interface MemberBalance {
  member: Member
  paid: number
  share: number
  balance: number
}

// Greedy settle-up: repeatedly matches the biggest creditor with the
// biggest debtor. Not the mathematically-minimal transfer set in every
// edge case, but it's the standard Splitwise-style heuristic and it's
// simple to follow when you're the one paying someone back.
function settleUp(balances: MemberBalance[]) {
  const EPSILON = 0.01
  const creditors = balances
    .filter((b) => b.balance > EPSILON)
    .map((b) => ({ member: b.member, amount: b.balance }))
    .sort((a, b) => b.amount - a.amount)
  const debtors = balances
    .filter((b) => b.balance < -EPSILON)
    .map((b) => ({ member: b.member, amount: -b.balance }))
    .sort((a, b) => b.amount - a.amount)

  const transfers: { from: Member; to: Member; amount: number }[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount)
    transfers.push({ from: debtors[i].member, to: creditors[j].member, amount })
    debtors[i].amount -= amount
    creditors[j].amount -= amount
    if (debtors[i].amount <= EPSILON) i++
    if (creditors[j].amount <= EPSILON) j++
  }
  return transfers
}

export function BalancesTab({ expenses, members, fxRates }: BalancesTabProps) {
  const activeMembers = useMemo(() => members.filter((m) => !m.leftAt), [members])

  const { balances, unassignedTotal, inactivePaidTotal, totalToSplit, share } = useMemo(() => {
    const activeIds = new Set(activeMembers.map((m) => m.id))
    const paidByMember = new Map<string, number>()
    let splitTotal = 0
    let unassigned = 0
    let inactivePaid = 0

    for (const e of expenses) {
      const amount = toEur(e.amount, e.currency, fxRates)
      if (!e.memberId) {
        unassigned += amount
        continue
      }
      if (!activeIds.has(e.memberId)) {
        inactivePaid += amount
        continue
      }
      splitTotal += amount
      paidByMember.set(e.memberId, (paidByMember.get(e.memberId) ?? 0) + amount)
    }

    const perHead = activeMembers.length > 0 ? splitTotal / activeMembers.length : 0
    const result: MemberBalance[] = activeMembers.map((member) => {
      const paid = paidByMember.get(member.id) ?? 0
      return { member, paid, share: perHead, balance: paid - perHead }
    })

    return { balances: result, unassignedTotal: unassigned, inactivePaidTotal: inactivePaid, totalToSplit: splitTotal, share: perHead }
  }, [expenses, activeMembers, fxRates])

  const transfers = useMemo(() => settleUp(balances), [balances])

  if (activeMembers.length === 0) {
    return (
      <div className="empty-state">
        Añade miembros activos en la pestaña Miembros para poder repartir los gastos.
      </div>
    )
  }

  return (
    <div className="balances">
      <div className="stat-row balances__summary">
        <div className="stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">Repartido</span>
            <span className="stat-card__icon" style={{ color: '#0d9488', background: 'rgba(13, 148, 136, 0.14)' }}>
              <Scale size={16} />
            </span>
          </div>
          <span className="stat-card__value">{formatMoneyRound(totalToSplit, 'EUR')}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">Por cabeza</span>
            <span className="stat-card__icon" style={{ color: '#7c3aed', background: 'rgba(124, 58, 237, 0.14)' }}>
              <Scale size={16} />
            </span>
          </div>
          <span className="stat-card__value">{formatMoneyRound(share, 'EUR')}</span>
        </div>
      </div>

      {unassignedTotal > 0.01 && (
        <p className="balances__notice">
          {formatMoneyRound(unassignedTotal, 'EUR')} en facturas sin "Pagado por" — no se han incluido en el reparto.
          Edítalas para asignarles quién las pagó.
        </p>
      )}
      {inactivePaidTotal > 0.01 && (
        <p className="balances__notice">
          {formatMoneyRound(inactivePaidTotal, 'EUR')} pagados por miembros de baja — quedan fuera del reparto
          actual.
        </p>
      )}

      <div className="panel">
        <h3 className="panel__title">Quién ha pagado qué</h3>
        <div className="table-wrap">
          <table className="expense-table expense-table--center">
            <thead>
              <tr>
                <th>Miembro</th>
                <th>Ha pagado</th>
                <th>Le toca</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {balances
                .slice()
                .sort((a, b) => b.balance - a.balance)
                .map((b) => (
                  <tr key={b.member.id}>
                    <td>{b.member.name || 'Sin nombre'}</td>
                    <td>{formatMoneyRound(b.paid, 'EUR')}</td>
                    <td>{formatMoneyRound(b.share, 'EUR')}</td>
                    <td>
                      <span
                        className={
                          b.balance > 0.01
                            ? 'balances__amount balances__amount--positive'
                            : b.balance < -0.01
                              ? 'balances__amount balances__amount--negative'
                              : 'balances__amount'
                        }
                      >
                        {b.balance > 0.01 ? '+' : ''}
                        {formatMoneyRound(b.balance, 'EUR')}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3 className="panel__title">Para saldar cuentas</h3>
        {transfers.length === 0 ? (
          <p className="muted">Todo el mundo está en paz — nadie debe nada.</p>
        ) : (
          <ul className="balances__transfers">
            {transfers.map((t, i) => (
              <li key={i} className="balances__transfer">
                <span className="balances__transfer-name">{t.from.name || 'Sin nombre'}</span>
                <ArrowRight size={14} className="muted" />
                <span className="balances__transfer-name">{t.to.name || 'Sin nombre'}</span>
                <span className="balances__transfer-amount">{formatMoneyRound(t.amount, 'EUR')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
