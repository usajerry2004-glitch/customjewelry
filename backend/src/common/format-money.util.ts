// US-style currency formatting — comma thousands separators, always exactly
// two decimal places (e.g. 1,111,111.00), regardless of locale defaults.
export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
