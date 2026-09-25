export function localDateISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(value: string, amount: number): string {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount);
  return localDateISO(date);
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en', options ?? {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(parseLocalDate(value));
}

export function formatShortDate(value: string): string {
  return formatDate(value, { month: 'short', day: 'numeric' });
}

export function formatDateHeading(value: string): string {
  return formatDate(value, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const remainder = whole % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function formatClockTime(value: string): string {
  if (!/^\d{2}:\d{2}$/.test(value)) return value || '—';
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function localClockTime(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function mondayOfWeek(value: string): string {
  const day = parseLocalDate(value).getDay();
  const daysSinceMonday = (day + 6) % 7;
  return addDays(value, -daysSinceMonday);
}

export function daysInMonth(value: string): number {
  const date = parseLocalDate(value);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
