// Kira SKUs ending in -61F / -62F are plated-silver pieces, not solid gold:
//   61F = rhodium plated silver, 62F = 14K yellow gold plated silver.
// The SKU alone is easy to miss on the factory sheet, so any order carrying
// one gets a plain-English line at the top of its order note (customerNotes,
// which is what prints on the factory order PDF).

const PLATING_NOTES: Record<string, string> = {
  '61': 'PLATED ORDER (61F): Rhodium plated silver.',
  '62': 'PLATED ORDER (62F): 14K yellow gold plated silver.',
};

// e.g. KJ01855B.RD-2-61F, KJ04473E.OV-2-62F, KJ01855B.RD-5-61F-S7
const PLATED_SKU_RE = /\bKJ\d+[A-Z]*\.[A-Z0-9.\-]*?-(6[12])F\b/gi;

type NoteFields = { kiraSkuNumber?: string | null; customerNotes?: string | null; referenceWeblink?: string | null };

// Returns the order note with any missing plating lines added at the top, or
// null when nothing needs to change. Never duplicates a line already there.
export function withPlatingNote(o: NoteFields): string | null {
  const haystack = [o.kiraSkuNumber, o.customerNotes, o.referenceWeblink].filter(Boolean).join('\n');
  const codes = new Set<string>();
  for (const m of haystack.matchAll(PLATED_SKU_RE)) codes.add(m[1]);
  if (!codes.size) return null;

  const notes = o.customerNotes || '';
  const missing = [...codes].sort().map(c => PLATING_NOTES[c]).filter(line => !notes.includes(line));
  if (!missing.length) return null;
  return notes ? `${missing.join('\n')}\n\n${notes}` : missing.join('\n');
}
