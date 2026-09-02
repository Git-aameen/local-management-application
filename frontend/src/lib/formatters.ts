const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

/** Formats a Decimal-as-string (or number) value as USD currency, e.g. "$75,000.00". */
export function formatCurrency(value: number | string): string {
  return currencyFormatter.format(Number(value))
}
