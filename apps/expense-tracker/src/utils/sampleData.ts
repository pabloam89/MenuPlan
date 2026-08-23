import { newId } from '../db'
import { daysAgoISO } from './format'
import type { Expense } from '../types'

// Demo/seed data so the UI is easy to evaluate without wiring the AI
// extraction first. These have no attached file (fileId: null) — the gallery
// shows a placeholder for those instead of a thumbnail.
export function buildSampleExpenses(): Expense[] {
  const now = new Date().toISOString()
  const base: Array<Omit<Expense, 'id' | 'createdAt' | 'fileId' | 'fileName' | 'fileType' | 'status' | 'errorMessage'>> = [
    {
      date: daysAgoISO(3),
      amount: 20,
      currency: 'USD',
      service: 'Vercel',
      customService: null,
      description: 'Plan Pro — facturación mensual',
    },
    {
      date: daysAgoISO(12),
      amount: 20,
      currency: 'USD',
      service: 'Cursor',
      customService: null,
      description: 'Suscripción Pro mensual',
    },
    {
      date: daysAgoISO(28),
      amount: 18,
      currency: 'USD',
      service: 'Claude (Anthropic)',
      customService: null,
      description: 'Claude Pro — suscripción mensual',
    },
  ]

  return base.map((item) => ({
    ...item,
    id: newId(),
    fileId: null,
    fileName: null,
    fileType: null,
    createdAt: now,
    status: 'manual' as const,
    errorMessage: null,
  }))
}
