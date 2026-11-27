// Kira DS (dropship) orders all need an IGI certificate. They're the orders
// placed under the "Kira DS Orders" store / ds.orders@kirajewels.one, whether
// they came in through the website API, a web order, or were entered by staff.
// The factory has to know this, so every DS order carries DS_ORDER_NOTE at the
// top of its order note (customerNotes — prints on the factory order PDF) and
// is flagged on the factory email and the order detail page.

export const DS_ORDER_LABEL = 'DS order - IGI Needed';
export const DS_ORDER_NOTE = 'DS ORDER - IGI NEEDED';
export const DS_ORDER_EMAIL = 'ds.orders@kirajewels.one';

type DsFields = { storeName?: string | null; customerEmail?: string | null };

export function isDsOrder(o: DsFields): boolean {
  return (o.customerEmail || '').trim().toLowerCase() === DS_ORDER_EMAIL
    || /\bkira\s*ds\b/i.test(o.storeName || '');
}

// Returns the order note with the DS line added at the top, or null when it's
// not a DS order or the line is already there.
export function withDsNote(o: DsFields & { customerNotes?: string | null }): string | null {
  if (!isDsOrder(o)) return null;
  const notes = o.customerNotes || '';
  if (notes.toUpperCase().includes(DS_ORDER_NOTE)) return null;
  return notes ? `${DS_ORDER_NOTE}\n${notes}` : DS_ORDER_NOTE;
}
