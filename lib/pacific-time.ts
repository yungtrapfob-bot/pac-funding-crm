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
