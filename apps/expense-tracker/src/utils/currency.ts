// Value of 1 unit of that currency, expressed in EUR.
export type FxRates = Record<string, number>

// Rough reference rates — meant as a sane starting point, not a live feed.
// The user can override any of these in the "Tipo de cambio" panel and the
// choice is remembered per-browser.
export const DEFAULT_FX_RATES: FxRates = { EUR: 1, USD: 0.92, GBP: 1.17 }

const STORAGE_KEY = 'mp_expense_fx_rates'

export function loadFxRates(): FxRates {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_FX_RATES, ...JSON.parse(raw) }
  } catch {
    // localStorage unavailable (private mode edge cases) — fall back to defaults
  }
  return { ...DEFAULT_FX_RATES }
}

export function saveFxRates(rates: FxRates): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates))
  } catch {
    // not fatal — rates just won't persist across reloads
  }
}

export function rateFor(currency: string, rates: FxRates): number {
  return rates[currency.toUpperCase()] ?? 1
}

export function toEur(amount: number, currency: string, rates: FxRates): number {
  return amount * rateFor(currency, rates)
}

export function fromEur(amountEur: number, currency: string, rates: FxRates): number {
  return amountEur / rateFor(currency, rates)
}

export function convert(amount: number, fromCurrency: string, toCurrency: string, rates: FxRates): number {
  return fromEur(toEur(amount, fromCurrency, rates), toCurrency, rates)
}
