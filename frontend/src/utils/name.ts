// Some accounts (single-name imports, agents with no surname on file, etc.)
// store lastName as the literal placeholder "—" when no real value exists.
// Naively concatenating firstName + lastName renders it visibly ("Chandan —").
const isPlaceholder = (s?: string | null) => !s || s.trim() === '' || s.trim() === '—';

export function formatName(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName || '').trim();
  if (isPlaceholder(lastName)) return first;
  return `${first} ${lastName!.trim()}`;
}

export function getInitials(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName || '').trim();
  const firstLetter = first ? first[0].toUpperCase() : '';
  if (isPlaceholder(lastName)) {
    return first.length > 1 ? (first[0] + first[1]).toUpperCase() : firstLetter;
  }
  return (firstLetter + lastName!.trim()[0].toUpperCase()).toUpperCase();
}
