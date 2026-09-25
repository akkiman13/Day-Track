import { DEFAULT_PREFERENCES, DEFAULT_THRESHOLDS, type LocalSnapshot, type Preferences, type StudySession, type XPThresholds } from './types';
import { isValidISODate } from './date-utils';

export const STORAGE_KEY = 'studytrack.local.v1';

export function emptySnapshot(): LocalSnapshot {
  return {
    version: 1,
    sessions: [],
    preferences: {
      theme: DEFAULT_PREFERENCES.theme,
      thresholds: { ...DEFAULT_THRESHOLDS },
    },
  };
}

function validThresholds(value: unknown): value is XPThresholds {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  const values = [t.level1, t.level2, t.level3, t.level4, t.level5];
  return values.every((n) => Number.isSafeInteger(n) && Number(n) >= 0)
    && values.every((n, index) => index === 0 || Number(n) > Number(values[index - 1]));
}

function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return emptySnapshot().preferences;
  const input = value as Record<string, unknown>;
  const theme = input.theme === 'dark' ? 'dark' : 'light';
  const thresholds = validThresholds(input.thresholds) ? input.thresholds : { ...DEFAULT_THRESHOLDS };
  return { theme, thresholds: { ...thresholds } };
}

function cleanString(value: unknown, fallback = '', maxLength = 5000): string {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maxLength);
}

function normalizeSession(value: unknown, index: number): StudySession {
  if (!value || typeof value !== 'object') throw new Error(`Session ${index + 1} is not an object.`);
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id.trim()) throw new Error(`Session ${index + 1} is missing an ID.`);
  if (!isValidISODate(item.date)) throw new Error(`Session ${index + 1} has an invalid date.`);
  const duration = Number(item.durationMinutes);
  const xp = Number(item.xp);
  const wasted = Number(item.wastedMinutes ?? 0);
  if (![duration, xp, wasted].every(Number.isSafeInteger) || duration < 0 || xp < 0 || wasted < 0) {
    throw new Error(`Session ${index + 1} has invalid minutes or XP. Values must be non-negative whole numbers.`);
  }
  const time = typeof item.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) ? item.time : '12:00';
  const createdAt = typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt))
    ? item.createdAt
    : new Date(0).toISOString();
  const updatedAt = typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt))
    ? item.updatedAt
    : undefined;

  return {
    id: item.id.slice(0, 160),
    date: item.date,
    time,
    subject: cleanString(item.subject, 'Other', 120).trim() || 'Other',
    topic: cleanString(item.topic, '', 500).trim(),
    durationMinutes: duration,
    xp,
    wastedMinutes: wasted,
    wastedReason: cleanString(item.wastedReason, '', 500).trim() || undefined,
    notes: cleanString(item.notes, '', 5000),
    createdAt,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function normalizeSnapshot(value: unknown): { snapshot: LocalSnapshot; duplicates: number } {
  if (!value || typeof value !== 'object') throw new Error('The selected file is not a StudyTrack backup.');
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !Array.isArray(input.sessions)) {
    throw new Error('Unsupported backup format. Choose a StudyTrack JSON export (version 1).');
  }
  if (input.sessions.length > 100000) throw new Error('This backup contains too many sessions to import.');

  const byId = new Map<string, StudySession>();
  let duplicates = 0;
  input.sessions.forEach((item, index) => {
    const session = normalizeSession(item, index);
    if (byId.has(session.id)) duplicates += 1;
    byId.set(session.id, session);
  });

  return {
    snapshot: {
      version: 1,
      sessions: [...byId.values()],
      preferences: normalizePreferences(input.preferences),
    },
    duplicates,
  };
}

export function readLocalSnapshot(): { snapshot: LocalSnapshot; error?: string } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { snapshot: emptySnapshot() };
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSnapshot(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local browser storage could not be read.';
    return { snapshot: emptySnapshot(), error: `Saved data could not be loaded (${message}). Import a backup or add a new session to replace the unreadable local file.` };
  }
}

export function writeLocalSnapshot(snapshot: LocalSnapshot): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}
