export type Theme = 'light' | 'dark';

export interface XPThresholds {
  level1: number;
  level2: number;
  level3: number;
  level4: number;
  level5: number;
}

export interface StudySession {
  id: string;
  date: string;
  time: string;
  subject: string;
  topic: string;
  durationMinutes: number;
  xp: number;
  wastedMinutes: number;
  wastedReason?: string;
  notes: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Preferences {
  theme: Theme;
  thresholds: XPThresholds;
}

export interface LocalSnapshot {
  version: 1;
  sessions: StudySession[];
  preferences: Preferences;
}

export const DEFAULT_THRESHOLDS: XPThresholds = {
  level1: 1,
  level2: 50,
  level3: 150,
  level4: 300,
  level5: 750,
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  thresholds: DEFAULT_THRESHOLDS,
};

export const SUBJECT_OPTIONS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'English',
  'Other',
] as const;
