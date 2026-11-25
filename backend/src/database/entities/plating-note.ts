// Kira SKUs ending in -61F / -62F are plated-silver pieces, not solid gold:
//   61F = rhodium plated silver, 62F = 14K yellow gold plated silver.
// The SKU alone is easy to miss on the factory sheet, so any order carrying
// one gets a plain-English line at the top of its order note (customerNotes,
// which is what prints on the factory order PDF).

const PLATING_NOTES: Record<string, string> = {
  '61': 'PLATED ORDER (61F): Rhodium plated silver.',
  '62': 'PLATED ORDER (62F): 14K yellow gold plated silver.',
};

// Any Kira SKU (KJ...) with "61F" or "62F" anywhere in it, e.g.
// KJ01855B.RD-2-61F, KJ04473E.OV-2-62F, KJ01855B.RD-5-61F-S7.
const KJ_SKU_RE = /\bKJ[0-9A-Z.\-]+/gi;
const PLATING_CODE_RE = /(6[12])F/gi;

type NoteFields = { kiraSkuNumber?: string | null; customerNotes?: string | null; referenceWeblink?: string | null };

// Returns the order note with any missing plating lines added at the top, or
// null when nothing needs to change. Never duplicates a line already there.
export function withPlatingNote(o: NoteFields): string | null {
  const haystack = [o.kiraSkuNumber, o.customerNotes, o.referenceWeblink].filter(Boolean).join('\n');
  const codes = new Set<string>();
  for (const sku of haystack.match(KJ_SKU_RE) || []) {
    for (const m of sku.matchAll(PLATING_CODE_RE)) codes.add(m[1]);
  }
  if (!codes.size) return null;

  const notes = o.customerNotes || '';
  const missing = [...codes].sort().map(c => PLATING_NOTES[c]).filter(line => !notes.includes(line));
  if (!missing.length) return null;
  return notes ? `${missing.join('\n')}\n\n${notes}` : missing.join('\n');
}
