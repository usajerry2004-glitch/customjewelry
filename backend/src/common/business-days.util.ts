// Counts full business days (Mon–Fri) strictly elapsed between two
// timestamps, ignoring time-of-day — used to gate the CAD approval-stall
// survey/reminder on business days rather than calendar days. Does not
// account for holidays.
export function businessDaysElapsed(from: Date, to: Date): number {
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  let count = 0;
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}
