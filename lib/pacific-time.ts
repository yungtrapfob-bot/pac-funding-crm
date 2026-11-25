const timeZone = 'America/Los_Angeles';

const localDateTime = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const displayDate = new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium' });

const displayDateTime = new Intl.DateTimeFormat('en-US', {
  timeZone,
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function pacificInputValue(value: string | Date) {
  const parts = localDateTime.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function pacificDate(value: string | Date) {
  return pacificInputValue(value).slice(0, 10);
}

export function formatPacificDate(value: string) {
  return displayDate.format(new Date(value));
}

export function formatPacificDateTime(value: string) {
  return displayDateTime.format(new Date(value));
}

export function parsePacificInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const utc = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(utc)) return null;

  // Los Angeles uses UTC−7 and UTC−8. During the fall repeated hour choose the first occurrence.
  for (const hours of [7, 8]) {
    const candidate = new Date(utc + hours * 3_600_000);
    if (pacificInputValue(candidate) === value) return candidate.toISOString();
  }
  return null;
}

const followUpDay = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' });
const followUpTime = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });

function possiblyLegacyDateOnly(value: Date, leadCreatedAt?: string) {
  return Boolean(leadCreatedAt && Date.parse(leadCreatedAt) < Date.parse('2026-05-19T00:00:00Z')
    && value.toISOString().endsWith('T00:00:00.000Z'));
}

export function followUpBucket(value: string, now: Date, leadCreatedAt?: string) {
  const due = new Date(value);
  const today = pacificDate(now);
  const unverified = possiblyLegacyDateOnly(due, leadCreatedAt);
  const day = unverified ? due.toISOString().slice(0, 10) : pacificDate(due);
  if (day < today || (!unverified && due < now)) return 'overdue';
  return day === today ? 'today' : 'upcoming';
}

export function formatPacificFollowUp(value: string, leadCreatedAt?: string) {
  const date = new Date(value);
  if (possiblyLegacyDateOnly(date, leadCreatedAt)) {
    // The legacy date migration stored date-only values at UTC midnight.
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(date) + ' · time unverified';
  }
  return `${followUpDay.format(date)} · ${followUpTime.format(date)}`;
}

export function pacificFollowUpPresets(now = new Date()) {
  const today = pacificDate(now);
  const shift = (days: number) => new Date(Date.parse(today + 'T00:00:00Z') + days * 86_400_000);
  const nextDay = shift(1).getUTCDay();
  const businessDayOffset = nextDay === 6 ? 3 : nextDay === 0 ? 2 : 1;
  const morning = (days: number) => shift(days).toISOString().slice(0, 10) + 'T09:00';
  const later = pacificInputValue(new Date(now.getTime() + 2 * 3_600_000));
  return [
    ...(later.startsWith(today) ? [{ label: 'Later today', value: later }] : []),
    { label: 'Tomorrow', value: morning(1) },
    { label: 'Next business day', value: morning(businessDayOffset) },
    { label: 'In 3 days', value: morning(3) },
    { label: 'Next week', value: morning(7) },
  ];
}
