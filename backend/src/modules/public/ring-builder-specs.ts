// Pulls product specs (size, metal, stone, quality…) out of the free text the
// website sends with each Ring Builder / custom order item. The website often
// puts these only in the item title/description ("Round Basket — Size 7 —
// 14K Yellow", "Ring Metal: 14K Yellow") instead of the dedicated fields, which
// left the order's Product Specs boxes blank. Also normalizes metal values to
// the exact options the order page dropdowns use (see METAL options in
// frontend/src/pages/orders/[id].tsx), e.g. "Yellow" -> "Yellow Gold".

export interface ParsedSpecs {
  size?: string;
  metalType?: string;
  metalColor?: string;
  stones?: string;
  caratWeight?: string;
  diamondQuality?: string;
  diamondType?: string;
  stamping?: string;
}

export function normalizeMetal(raw?: string | null): { metalType?: string; metalColor?: string } {
  if (!raw) return {};
  const s = raw.toLowerCase();
  let metalType: string | undefined;
  const karat = s.match(/\b(10|14|18)\s*(k|kt|karat)\b/);
  if (karat) metalType = `${karat[1]}K`;
  else if (/platinum|\bpt\s*-?\s*950\b|\bplat\b/.test(s)) metalType = 'Platinum';

  let metalColor: string | undefined;
  if (/two[\s-]?tone|tri[\s-]?color/.test(s)) metalColor = 'Two-Tone';
  else if (/\brose\b|\bpink\b/.test(s)) metalColor = 'Rose Gold';
  else if (/\bwhite\b/.test(s)) metalColor = 'White Gold';
  else if (/\byellow\b/.test(s)) metalColor = 'Yellow Gold';
  else if (metalType === 'Platinum' || /platinum/.test(s)) metalColor = 'Platinum';

  return { metalType, metalColor };
}

const clean = (v?: string) => {
  const t = (v || '').replace(/\s+/g, ' ').trim();
  return t || undefined;
};

// "Label: value" lines -> spec. Labels are matched loosely ("Ring Size",
// "Bracelet Size", "Ring Metal", "Center Stone", "Diamond Quality"…).
export function parseSpecsFromText(...texts: (string | null | undefined)[]): ParsedSpecs {
  const text = texts.filter(Boolean).join('\n');
  if (!text) return {};
  const out: ParsedSpecs = {};
  let metalText: string | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const m = rawLine.match(/^\s*[-•*]?\s*([A-Za-z][A-Za-z #/()]{1,40}?)\s*[:=]\s*(.+)$/);
    if (!m) continue;
    const label = m[1].toLowerCase().trim();
    const value = clean(m[2]);
    if (!value) continue;

    if (/\bsize\b|\blength\b/.test(label) && !/stone|diamond/.test(label)) out.size ??= value;
    else if (/metal/.test(label)) metalText ??= value;
    else if (/stamp/.test(label)) out.stamping ??= value;
    else if (/quality|clarity/.test(label)) out.diamondQuality ??= value;
    else if (/carat|ctw|total weight/.test(label)) out.caratWeight ??= value;
    else if (/diamond type|stone type|lab|natural/.test(label)) out.diamondType ??= value;
    else if (/^(center |centre |main )?(stones?|shape|stone shape|diamond shape|diamond)$/.test(label)) out.stones ??= value;
  }

  // Title style: "Round Basket Full — Size 7 — 3.66 ct · 14K Yellow"
  if (!out.size) {
    const s = text.match(/\bsize\s*[-:#]?\s*(\d+(?:\.\d+)?(?:\s*(?:\d\/\d|¼|½|¾))?(?:\s*(?:inch|inches|in|"|mm|cm))?)/i);
    if (s) out.size = clean(s[1]);
  }

  const metal = normalizeMetal(metalText);
  const anywhere = normalizeMetal(text);
  out.metalType = metal.metalType || anywhere.metalType;
  out.metalColor = metal.metalColor || (metal.metalType ? undefined : anywhere.metalColor)
    || (out.metalType === 'Platinum' ? 'Platinum' : undefined);

  if (!out.diamondQuality) {
    const q = text.match(/\b([D-J](?:\s*[-/]\s*[D-J])?\s*\+?\s*,?\s*(?:IF|VVS\s*[12]?|VS\s*[12]?|SI\s*[12]?)\s*\+?)(?![A-Za-z])/);
    if (q) out.diamondQuality = clean(q[1]);
  }
  if (!out.diamondType) {
    if (/lab[\s-]?(grown|created)|\blgd\b/i.test(text)) out.diamondType = 'Lab Grown Diamond';
    else if (/\bnatural\s+diamond/i.test(text)) out.diamondType = 'Natural Diamond';
  }

  return out;
}
