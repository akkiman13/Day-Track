'use client';

import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Flame,
  LayoutDashboard,
  LogOut,
  Moon,
  Pencil,
  Plus,
  ShieldCheck,
  Sun,
  Trash2,
  Trophy,
  Upload,
  X,
  FileJson,
  FileSpreadsheet,
} from 'lucide-react';
import {
  FormEvent,
  CSSProperties,
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { addDays, daysInMonth, formatClockTime, formatDate, formatDateHeading, formatDuration, localClockTime, localDateISO, mondayOfWeek, parseLocalDate } from '@/lib/date-utils';
import { emptySnapshot, normalizeSnapshot, readLocalSnapshot, writeLocalSnapshot } from '@/lib/local-data';
import { DEFAULT_THRESHOLDS, SUBJECT_OPTIONS, type LocalSnapshot, type StudySession, type XPThresholds } from '@/lib/types';

type PageKey = 'dashboard' | 'insights' | 'settings';
type ToastMessage = { tone: 'success' | 'error' | 'info'; text: string };
type SessionDraft = Omit<StudySession, 'id' | 'createdAt' | 'updatedAt'>;
type DayTotals = {
  sessions: StudySession[];
  studyMinutes: number;
  xp: number;
  wastedMinutes: number;
  productivity: number | null;
};
type ConfirmAction =
  | { type: 'delete'; session: StudySession }
  | { type: 'clear' }
  | { type: 'import'; snapshot: LocalSnapshot; duplicates: number };

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const numberFormat = new Intl.NumberFormat('en-US');

function totalOf(sessions: StudySession[]) {
  return sessions.reduce((acc, session) => ({
    studyMinutes: acc.studyMinutes + session.durationMinutes,
    xp: acc.xp + session.xp,
    wastedMinutes: acc.wastedMinutes + session.wastedMinutes,
    count: acc.count + 1,
  }), { studyMinutes: 0, xp: 0, wastedMinutes: 0, count: 0 });
}

function totalsForDay(sessions: StudySession[], date: string): DayTotals {
  const daySessions = sessions.filter((session) => session.date === date)
    .sort((a, b) => a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt));
  const totals = totalOf(daySessions);
  const recordedTime = totals.studyMinutes + totals.wastedMinutes;
  return {
    sessions: daySessions,
    studyMinutes: totals.studyMinutes,
    xp: totals.xp,
    wastedMinutes: totals.wastedMinutes,
    productivity: recordedTime > 0 ? Math.round((totals.studyMinutes / recordedTime) * 100) : null,
  };
}

function subjectTotals(sessions: StudySession[], metric: 'time' | 'xp') {
  const grouped = new Map<string, number>();
  sessions.forEach((session) => {
    grouped.set(session.subject, (grouped.get(session.subject) ?? 0) + (metric === 'time' ? session.durationMinutes : session.xp));
  });
  return [...grouped.entries()].map(([subject, value]) => ({ subject, value }))
    .sort((a, b) => b.value - a.value || a.subject.localeCompare(b.subject));
}

function xpLevel(xp: number, thresholds: XPThresholds): number {
  if (xp <= 0) return 0;
  if (xp >= thresholds.level5) return 5;
  if (xp >= thresholds.level4) return 4;
  if (xp >= thresholds.level3) return 3;
  if (xp >= thresholds.level2) return 2;
  if (xp >= thresholds.level1) return 1;
  return 0;
}

function currentStreakValues(sessions: StudySession[], today: string) {
  const activeDates = new Set(sessions.filter((session) => session.durationMinutes > 0 && session.date <= today).map((session) => session.date));
  const sorted = [...activeDates].sort();
  let longest = 0;
  let run = 0;
  let prior = '';
  for (const date of sorted) {
    run = prior && addDays(prior, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    prior = date;
  }

  let cursor = activeDates.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (activeDates.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest, activeDays: activeDates.size };
}

function aggregateByDate(sessions: StudySession[]) {
  const map = new Map<string, { xp: number; minutes: number; count: number; wasted: number }>();
  sessions.forEach((session) => {
    const current = map.get(session.date) ?? { xp: 0, minutes: 0, count: 0, wasted: 0 };
    current.xp += session.xp;
    current.minutes += session.durationMinutes;
    current.count += 1;
    current.wasted += session.wastedMinutes;
    map.set(session.date, current);
  });
  return map;
}

function formatInputValue(value: number) {
  return value === 0 ? '' : String(value);
}

function createBlankFields(date: string, session?: StudySession) {
  if (!session) {
    return {
      date,
      time: localClockTime(),
      subject: 'Mathematics',
      customSubject: '',
      topic: '',
      hours: '',
      minutes: '',
      xp: '',
      wastedHours: '',
      wastedMinutes: '',
      wastedReason: '',
      notes: '',
    };
  }
  const recognized = (SUBJECT_OPTIONS as readonly string[]).includes(session.subject) && session.subject !== 'Other';
  return {
    date: session.date,
    time: session.time,
    subject: recognized ? session.subject : 'Other',
    customSubject: recognized ? '' : session.subject,
    topic: session.topic,
    hours: formatInputValue(Math.floor(session.durationMinutes / 60)),
    minutes: formatInputValue(session.durationMinutes % 60),
    xp: String(session.xp),
    wastedHours: formatInputValue(Math.floor(session.wastedMinutes / 60)),
    wastedMinutes: formatInputValue(session.wastedMinutes % 60),
    wastedReason: session.wastedReason ?? '',
    notes: session.notes,
  };
}

type SessionFields = ReturnType<typeof createBlankFields>;

function SessionForm({
  date,
  initialSession,
  onSave,
  onCancel,
  onDateChange,
  submitLabel = 'Add session',
  compact = false,
}: {
  date: string;
  initialSession?: StudySession;
  onSave: (draft: SessionDraft) => void;
  onCancel?: () => void;
  onDateChange?: (date: string) => void;
  submitLabel?: string;
  compact?: boolean;
}) {
  const [fields, setFields] = useState<SessionFields>(() => createBlankFields(date, initialSession));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initialSession && date) setFields((current) => ({ ...current, date }));
  }, [date, initialSession]);

  function update<K extends keyof SessionFields>(key: K, value: SessionFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    if (error) setError('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = fields.subject === 'Other' ? fields.customSubject.trim() : fields.subject;
    const durationHours = fields.hours === '' ? 0 : Number(fields.hours);
    const durationRemainder = fields.minutes === '' ? 0 : Number(fields.minutes);
    const wastedHours = fields.wastedHours === '' ? 0 : Number(fields.wastedHours);
    const wastedRemainder = fields.wastedMinutes === '' ? 0 : Number(fields.wastedMinutes);
    const xpValue = fields.xp === '' ? NaN : Number(fields.xp);

    if (!fields.date) return setError('Choose the date for this session.');
    if (!subject) return setError('Choose a subject or enter a custom subject.');
    if (!fields.topic.trim()) return setError('Add a short topic so you can find this session later.');
    if (![durationHours, durationRemainder, wastedHours, wastedRemainder].every((n) => Number.isSafeInteger(n) && n >= 0)) {
      return setError('Time values must be non-negative whole numbers.');
    }
    if (durationRemainder > 59 || wastedRemainder > 59) return setError('Minutes must be between 0 and 59.');
    const durationMinutes = durationHours * 60 + durationRemainder;
    const wastedMinutes = wastedHours * 60 + wastedRemainder;
    if (!Number.isSafeInteger(durationMinutes) || !Number.isSafeInteger(wastedMinutes)) return setError('The time entered is too large.');
    if (durationMinutes <= 0) return setError('Study time must be at least one minute.');
    if (!Number.isSafeInteger(xpValue) || xpValue < 0) return setError('Enter the XP you earned as a whole number (0 or more).');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.time)) return setError('Enter a valid session time.');

    onSave({
      date: fields.date,
      time: fields.time,
      subject,
      topic: fields.topic.trim(),
      durationMinutes,
      xp: xpValue,
      wastedMinutes,
      wastedReason: wastedMinutes > 0 ? fields.wastedReason.trim() : undefined,
      notes: fields.notes.trim(),
    });
  }

  return (
    <form className={`session-form${compact ? ' compact-form' : ''}`} onSubmit={handleSubmit}>
      {!compact && (
        <div className="entry-date-banner">
          <div className="entry-date-icon"><CalendarDays size={17} /></div>
          <div className="entry-date-copy"><span>Session date</span><strong>{formatDateHeading(fields.date)}</strong></div>
          <input
            aria-label="Session date"
            type="date"
            value={fields.date}
            onChange={(event) => {
              update('date', event.target.value);
              onDateChange?.(event.target.value);
            }}
          />
        </div>
      )}
      <div className="form-grid">
        {compact && <div className="field"><label htmlFor="edit-date">Session date <span className="required-mark">Required</span></label><input id="edit-date" type="date" value={fields.date} onChange={(event) => update('date', event.target.value)} required /></div>}
        <div className="field">
          <label htmlFor={compact ? 'edit-subject' : 'new-subject'}>Subject <span className="required-mark">Required</span></label>
          <select id={compact ? 'edit-subject' : 'new-subject'} value={fields.subject} onChange={(event) => update('subject', event.target.value)}>
            {SUBJECT_OPTIONS.map((subject) => <option value={subject} key={subject}>{subject}</option>)}
          </select>
          {fields.subject === 'Other' && (
            <input className="custom-subject-input" aria-label="Custom subject" value={fields.customSubject} onChange={(event) => update('customSubject', event.target.value)} placeholder="Name this subject" maxLength={120} />
          )}
        </div>
        <div className="field">
          <label htmlFor={compact ? 'edit-topic' : 'new-topic'}>Topic <span className="required-mark">Required</span></label>
          <input id={compact ? 'edit-topic' : 'new-topic'} value={fields.topic} onChange={(event) => update('topic', event.target.value)} placeholder="e.g. Functions — domain and range" maxLength={500} required />
        </div>
        <div className="field">
          <label>Study time <span className="required-mark">Required</span></label>
          <div className="split-inputs">
            <label className="unit-input"><input aria-label="Study hours" inputMode="numeric" type="number" min="0" step="1" value={fields.hours} onChange={(event) => update('hours', event.target.value)} placeholder="0" /><span>hours</span></label>
            <label className="unit-input"><input aria-label="Study minutes" inputMode="numeric" type="number" min="0" max="59" step="1" value={fields.minutes} onChange={(event) => update('minutes', event.target.value)} placeholder="30" /><span>min</span></label>
          </div>
        </div>
        <div className="field">
          <label htmlFor={compact ? 'edit-xp' : 'new-xp'}>XP earned <span className="required-mark">You decide</span></label>
          <div className="suffix-input"><input id={compact ? 'edit-xp' : 'new-xp'} aria-label="XP earned" inputMode="numeric" type="number" min="0" step="1" value={fields.xp} onChange={(event) => update('xp', event.target.value)} placeholder="0" required /><span>XP</span></div>
          <span className="field-hint">Only the amount you enter is counted.</span>
        </div>
        <div className="field">
          <label>Wasted time <span className="optional-mark">Optional</span></label>
          <div className="split-inputs">
            <label className="unit-input"><input aria-label="Wasted hours" inputMode="numeric" type="number" min="0" step="1" value={fields.wastedHours} onChange={(event) => update('wastedHours', event.target.value)} placeholder="0" /><span>hours</span></label>
            <label className="unit-input"><input aria-label="Wasted minutes" inputMode="numeric" type="number" min="0" max="59" step="1" value={fields.wastedMinutes} onChange={(event) => update('wastedMinutes', event.target.value)} placeholder="0" /><span>min</span></label>
          </div>
        </div>
        <div className="field">
          <label htmlFor={compact ? 'edit-time' : 'new-time'}>Time of session <span className="optional-mark">Local time</span></label>
          <input id={compact ? 'edit-time' : 'new-time'} type="time" value={fields.time} onChange={(event) => update('time', event.target.value)} required />
        </div>
        <div className="field field-wide">
          <label htmlFor={compact ? 'edit-wasted-reason' : 'new-wasted-reason'}>Wasted time note <span className="optional-mark">Optional</span></label>
          <input id={compact ? 'edit-wasted-reason' : 'new-wasted-reason'} value={fields.wastedReason} onChange={(event) => update('wastedReason', event.target.value)} placeholder="Distractions, scrolling, or anything useful to remember" maxLength={500} />
        </div>
        <div className="field field-wide">
          <label htmlFor={compact ? 'edit-notes' : 'new-notes'}>Notes <span className="optional-mark">Optional</span></label>
          <textarea id={compact ? 'edit-notes' : 'new-notes'} rows={3} value={fields.notes} onChange={(event) => update('notes', event.target.value)} placeholder="What did you complete or learn?" maxLength={5000} />
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        {onCancel && <button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button>}
        <button className="button button-primary" type="submit"><Plus size={17} /> {submitLabel}</button>
      </div>
    </form>
  );
}

function StatCard({ label, value, detail, icon, accent = '' }: { label: string; value: string; detail: string; icon: React.ReactNode; accent?: string }) {
  return (
    <article className={`stat-card ${accent}`}>
      <div className="stat-card-top"><span className="stat-label">{label}</span><span className="stat-icon">{icon}</span></div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-detail">{detail}</span>
    </article>
  );
}

function ActivityCalendar({
  sessions,
  thresholds,
  today,
  onSelect,
}: {
  sessions: StudySession[];
  thresholds: XPThresholds;
  today: string;
  onSelect: (date: string) => void;
}) {
  const weeks = useMemo(() => {
    const initial = addDays(today, -364);
    const start = mondayOfWeek(initial);
    const end = addDays(mondayOfWeek(today), 6);
    const columns: string[][] = [];
    let cursor = start;
    while (cursor <= end) {
      columns.push(Array.from({ length: 7 }, (_, index) => addDays(cursor, index)));
      cursor = addDays(cursor, 7);
    }
    return columns;
  }, [today]);
  const activityByDate = useMemo(() => aggregateByDate(sessions), [sessions]);
  const rangeStart = weeks[0]?.[0] ?? today;
  const rangeSessions = sessions.filter((session) => session.date >= rangeStart && session.date <= today);
  const activeDays = new Set(rangeSessions.filter((session) => session.durationMinutes > 0).map((session) => session.date)).size;
  const totalXP = rangeSessions.reduce((sum, session) => sum + session.xp, 0);
  const monthLabels = weeks.map((week, index) => {
    const firstOfMonth = week.find((date) => parseLocalDate(date).getDate() === 1);
    const showDate = firstOfMonth ?? (index === 0 ? week[0] : '');
    return showDate ? new Intl.DateTimeFormat('en', { month: 'short' }).format(parseLocalDate(showDate)) : '';
  });

  return (
    <section className="card heatmap-card">
      <div className="section-heading heatmap-heading">
        <div>
          <p className="eyebrow">THE LONG VIEW</p>
          <h2>Study activity</h2>
          <p className="section-subtitle">Each square is a day. Colour is based on XP you entered.</p>
        </div>
        <div className="heatmap-period"><span className="live-dot" />Last 12 months</div>
      </div>
      <div className="heatmap-scroll" role="region" aria-label="Study activity calendar, last twelve months" tabIndex={0}>
        <div className="heatmap-layout">
          <div className="heatmap-side-labels">
            <div className="month-spacer" />
            {DAY_LABELS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="heatmap-board">
            <div className="heatmap-months" style={{ gridTemplateColumns: `repeat(${weeks.length}, 13px)` }}>
              {monthLabels.map((month, index) => <span key={`${month}-${index}`}>{month}</span>)}
            </div>
            <div className="heatmap-grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 13px)` }}>
              {weeks.flatMap((week, weekIndex) => week.map((date, dayIndex) => {
                const totals = activityByDate.get(date);
                const xp = totals?.xp ?? 0;
                const level = xpLevel(xp, thresholds);
                const isFuture = date > today;
                const tooltip = `${formatDate(date)}\nStudy: ${formatDuration(totals?.minutes ?? 0)}\nXP: ${numberFormat.format(xp)}\nSessions: ${totals?.count ?? 0}\nWasted: ${formatDuration(totals?.wasted ?? 0)}`;
                return (
                  <button
                    type="button"
                    key={`${weekIndex}-${dayIndex}`}
                    className={`heat-cell heat-level-${level}${isFuture ? ' future-cell' : ''}`}
                    title={tooltip}
                    aria-label={`${tooltip.replaceAll('\n', ', ')}${isFuture ? ', future date' : ''}`}
                    onClick={() => onSelect(date)}
                  />
                );
              }))}
            </div>
          </div>
        </div>
      </div>
      <div className="heatmap-footer">
        <div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4, 5].map((level) => <i className={`heat-cell heat-level-${level}`} key={level} aria-label={`Level ${level}`} />)}<span>More</span></div>
        <p><strong>{activeDays}</strong> active {activeDays === 1 ? 'day' : 'days'} <span className="muted-separator">·</span> <strong>{numberFormat.format(totalXP)}</strong> XP recorded</p>
      </div>
      <div className="threshold-caption">Daily XP levels use your thresholds: {thresholds.level1}, {thresholds.level2}, {thresholds.level3}, {thresholds.level4}, {thresholds.level5}+ XP. Change them in Settings.</div>
    </section>
  );
}

function SessionHistory({
  date,
  sessions,
  onEdit,
  onDelete,
}: {
  date: string;
  sessions: StudySession[];
  onEdit: (session: StudySession) => void;
  onDelete: (session: StudySession) => void;
}) {
  const daySessions = sessions.filter((session) => session.date === date)
    .sort((a, b) => b.time.localeCompare(a.time) || b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="card history-card">
      <div className="section-heading">
        <div><p className="eyebrow">YOUR LOGBOOK</p><h2>{date === localDateISO() ? "Today's sessions" : 'Sessions for this day'}</h2><p className="section-subtitle">{formatDate(date)}</p></div>
        <span className="count-pill">{daySessions.length} {daySessions.length === 1 ? 'session' : 'sessions'}</span>
      </div>
      {daySessions.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><BookOpen size={20} /></div><h3>No study sessions yet.</h3><p>Start by logging your first study session.</p></div>
      ) : (
        <div className="session-list">
          {daySessions.map((session, index) => (
            <article className="session-row" key={session.id}>
              <div className="session-time-column"><span className="session-time">{formatClockTime(session.time)}</span><span className={`timeline-marker${index === daySessions.length - 1 ? ' last-marker' : ''}`} /></div>
              <div className="session-info">
                <div className="session-title-row"><h3>{session.subject}</h3><span className="session-title-dot">·</span><p>{session.topic}</p></div>
                <div className="session-meta">
                  <span><Clock3 size={14} />{formatDuration(session.durationMinutes)}</span>
                  <span className="xp-meta">+{numberFormat.format(session.xp)} XP</span>
                  {session.wastedMinutes > 0 && <span className="wasted-meta">{formatDuration(session.wastedMinutes)} recorded away</span>}
                </div>
                {session.wastedReason && <p className="session-note"><span>Wasted time:</span> {session.wastedReason}</p>}
                {session.notes && <p className="session-note">{session.notes}</p>}
              </div>
              <div className="row-actions">
                <button className="icon-button" type="button" title="Edit session" aria-label={`Edit ${session.subject} session`} onClick={() => onEdit(session)}><Pencil size={15} /></button>
                <button className="icon-button icon-button-danger" type="button" title="Delete session" aria-label={`Delete ${session.subject} session`} onClick={() => onDelete(session)}><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DashboardPage({
  sessions,
  selectedDate,
  today,
  thresholds,
  onDateChange,
  onEdit,
  onDelete,
  onSelectCalendarDay,
  onAdd,
}: {
  sessions: StudySession[];
  selectedDate: string;
  today: string;
  thresholds: XPThresholds;
  onDateChange: (date: string) => void;
  onEdit: (session: StudySession) => void;
  onDelete: (session: StudySession) => void;
  onSelectCalendarDay: (date: string) => void;
  onAdd: (draft: SessionDraft) => void;
}) {
  const totals = totalsForDay(sessions, selectedDate);
  const selectedIsFuture = selectedDate > today;
  const [formKey, setFormKey] = useState(0);
  const handleAdd = (draft: SessionDraft) => {
    onAdd(draft);
    setFormKey((key) => key + 1);
  };

  return (
    <div className="page-stack">
      <section className="dashboard-intro">
        <div className="intro-copy">
          <p className="eyebrow">YOUR STUDY LOG</p>
          <h1>{formatDateHeading(selectedDate)}</h1>
          <p>{selectedDate === today ? 'A clear record of the work you chose to do.' : 'Review a day or log a session for this date.'}</p>
        </div>
        <div className="date-navigation" aria-label="Choose a day">
          <button className="icon-button date-arrow" type="button" title="Previous day" aria-label="Previous day" onClick={() => onDateChange(addDays(selectedDate, -1))}><ChevronLeft size={18} /></button>
          <label className="date-picker-wrap"><CalendarDays size={15} /><input aria-label="Selected date" type="date" value={selectedDate} onChange={(event) => event.target.value && onDateChange(event.target.value)} /></label>
          <button className="icon-button date-arrow" type="button" title="Next day" aria-label="Next day" onClick={() => onDateChange(addDays(selectedDate, 1))}><ChevronRight size={18} /></button>
          {selectedDate !== today && <button className="button button-small button-quiet" type="button" onClick={() => onDateChange(today)}>Today</button>}
        </div>
      </section>
      {selectedIsFuture && <div className="future-notice"><CalendarDays size={16} /><span>This is a future date. Nothing is counted unless you intentionally log a session here.</span></div>}

      <section className="stats-grid" aria-label="Selected day statistics">
        <StatCard label="Study time" value={formatDuration(totals.studyMinutes)} detail="Recorded study" icon={<Clock3 size={17} />} accent="stat-green" />
        <StatCard label="XP earned" value={`${numberFormat.format(totals.xp)} XP`} detail="Entered by you" icon={<Activity size={17} />} accent="stat-violet" />
        <StatCard label="Sessions" value={String(totals.sessions.length)} detail="Logged sessions" icon={<BookOpen size={17} />} />
        <StatCard label="Wasted time" value={formatDuration(totals.wastedMinutes)} detail="Optional, recorded only" icon={<Clock3 size={17} />} accent="stat-amber" />
        <StatCard label="Productivity" value={totals.productivity === null ? '—' : `${totals.productivity}%`} detail="Study ÷ (study + wasted)" icon={<BarChart3 size={17} />} accent="stat-blue" />
      </section>

      <section className="card entry-card">
        <div className="section-heading entry-heading">
          <div className="heading-with-icon"><div className="heading-icon"><Plus size={18} /></div><div><p className="eyebrow">QUICK ENTRY</p><h2>Log a study session</h2><p className="section-subtitle">A few details now make your progress easier to understand later.</p></div></div>
          <span className="manual-xp-note"><ShieldCheck size={15} /> XP stays in your hands</span>
        </div>
        <SessionForm key={formKey} date={selectedDate} onDateChange={onDateChange} onSave={handleAdd} submitLabel="Add session" />
      </section>

      <ActivityCalendar sessions={sessions} thresholds={thresholds} today={today} onSelect={onSelectCalendarDay} />

      <SessionHistory date={selectedDate} sessions={sessions} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function RangeMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="range-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function StudyBarChart({ sessions, today }: { sessions: StudySession[]; today: string }) {
  const chartDays = Array.from({ length: 30 }, (_, index) => addDays(today, index - 29));
  const dateTotals = aggregateByDate(sessions);
  const values = chartDays.map((date) => dateTotals.get(date)?.minutes ?? 0);
  const max = Math.max(60, ...values);
  return (
    <section className="card chart-card">
      <div className="section-heading"><div><p className="eyebrow">CONSISTENCY</p><h2>Study time, day by day</h2><p className="section-subtitle">Recorded minutes over the last 30 days.</p></div><div className="chart-legend"><i />Study time</div></div>
      <div className="bar-chart" role="img" aria-label="Bar chart of recorded study time over the last 30 days">
        {chartDays.map((date, index) => {
          const minutes = values[index];
          const height = minutes > 0 ? Math.max(6, (minutes / max) * 100) : 2;
          const title = `${formatDate(date)} — ${formatDuration(minutes)} study, ${numberFormat.format(dateTotals.get(date)?.xp ?? 0)} XP`;
          return <div className="bar-column" key={date} title={title}><span className={`bar-value${minutes === 0 ? ' bar-empty' : ''}`} style={{ height: `${height}%` }} /><span className="bar-date">{index % 5 === 0 || index === 29 ? parseLocalDate(date).getDate() : ''}</span></div>;
        })}
      </div>
      <div className="chart-axis"><span>{formatDate(chartDays[0], { month: 'short', day: 'numeric' })}</span><span>Today</span></div>
    </section>
  );
}

function SubjectBreakdown({ sessions }: { sessions: StudySession[] }) {
  const [metric, setMetric] = useState<'time' | 'xp'>('time');
  const items = subjectTotals(sessions, metric);
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <section className="card subject-card">
      <div className="section-heading subject-heading"><div><p className="eyebrow">SUBJECT BALANCE</p><h2>Where your effort went</h2><p className="section-subtitle">All recorded sessions</p></div>
        <div className="segmented-control" role="group" aria-label="Subject chart metric">
          <button className={metric === 'time' ? 'active' : ''} onClick={() => setMetric('time')} type="button">Study time</button>
          <button className={metric === 'xp' ? 'active' : ''} onClick={() => setMetric('xp')} type="button">XP</button>
        </div>
      </div>
      {items.length === 0 ? <div className="empty-chart">Subject breakdown will appear after you log a session.</div> : (
        <div className="subject-bars">
          {items.map((item, index) => (
            <div className="subject-bar-row" key={item.subject}>
              <div className="subject-bar-label"><span>{item.subject}</span><strong>{metric === 'time' ? formatDuration(item.value) : `${numberFormat.format(item.value)} XP`}</strong></div>
              <div className="subject-track"><span className={`subject-fill subject-fill-${index % 5}`} style={{ width: `${item.value === 0 ? 0 : Math.max(2, (item.value / max) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      <p className="chart-footnote">The selected metric is summed from your saved sessions; no activity is estimated.</p>
    </section>
  );
}

function InsightsPage({ sessions, today }: { sessions: StudySession[]; today: string }) {
  const todayTotals = totalsForDay(sessions, today);
  const weekStart = mondayOfWeek(today);
  const weekSessions = sessions.filter((session) => session.date >= weekStart && session.date <= today);
  const weekTotals = totalOf(weekSessions);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthSessions = sessions.filter((session) => session.date >= monthStart && session.date <= today);
  const monthTotals = totalOf(monthSessions);
  const activeMonthSubject = subjectTotals(monthSessions, 'time')[0]?.subject ?? '—';
  const historicSessions = sessions.filter((session) => session.date <= today);
  const historicTotals = totalOf(historicSessions);
  const streaks = currentStreakValues(sessions, today);
  const dailyXp = streaks.activeDays > 0 ? Math.round(historicTotals.xp / streaks.activeDays) : 0;
  const byDate = aggregateByDate(historicSessions);
  const highest = [...byDate.entries()].sort((a, b) => b[1].xp - a[1].xp || a[0].localeCompare(b[0]))[0];
  const todayDate = parseLocalDate(today);
  const elapsedDays = todayDate.getDate();

  return (
    <div className="page-stack insights-page">
      <section className="page-title-row"><div><p className="eyebrow">THE BIG PICTURE</p><h1>Insights</h1><p>Understand your time, effort and consistency from the sessions you actually logged.</p></div><div className="period-chip"><CalendarDays size={15} />Through {formatDate(today, { month: 'short', day: 'numeric' })}</div></section>

      <section className="card period-card">
        <div className="section-heading"><div><p className="eyebrow">WEEK TO DATE</p><h2>This week</h2><p className="section-subtitle">Monday, {formatDate(weekStart, { month: 'short', day: 'numeric' })} – today</p></div><span className="section-aside">{weekTotals.count} {weekTotals.count === 1 ? 'session' : 'sessions'}</span></div>
        <div className="range-metrics-grid">
          <RangeMetric label="Study time" value={formatDuration(weekTotals.studyMinutes)} detail="Recorded" />
          <RangeMetric label="XP earned" value={`${numberFormat.format(weekTotals.xp)} XP`} detail="Manually entered" />
          <RangeMetric label="Average XP / active day" value={`${numberFormat.format(streaks.activeDays ? Math.round(weekTotals.xp / Math.max(1, new Set(weekSessions.filter((s) => s.durationMinutes > 0).map((s) => s.date)).size)) : 0)} XP`} detail="This week to date" />
          <RangeMetric label="Study sessions" value={String(weekTotals.count)} detail="This week to date" />
        </div>
      </section>

      <section className="card period-card">
        <div className="section-heading"><div><p className="eyebrow">MONTH TO DATE</p><h2>This month</h2><p className="section-subtitle">From {formatDate(monthStart, { month: 'long', day: 'numeric' })} through today</p></div><span className="section-aside">{monthTotals.count} {monthTotals.count === 1 ? 'session' : 'sessions'}</span></div>
        <div className="range-metrics-grid">
          <RangeMetric label="Study time" value={formatDuration(monthTotals.studyMinutes)} detail="Recorded" />
          <RangeMetric label="XP earned" value={`${numberFormat.format(monthTotals.xp)} XP`} detail="Manually entered" />
          <RangeMetric label="Average study / day" value={formatDuration(Math.round(monthTotals.studyMinutes / Math.max(1, elapsedDays)))} detail={`Across ${elapsedDays} calendar ${elapsedDays === 1 ? 'day' : 'days'}`} />
          <RangeMetric label="Most studied subject" value={activeMonthSubject} detail="By study time" />
        </div>
      </section>

      <section className="xp-summary card">
        <div className="xp-summary-main"><div className="xp-orb"><Trophy size={21} /></div><div><p className="eyebrow">XP DASHBOARD</p><h2>Total XP</h2><strong className="total-xp">{numberFormat.format(historicTotals.xp)} <span>XP</span></strong><p className="section-subtitle">Across {streaks.activeDays} recorded study {streaks.activeDays === 1 ? 'day' : 'days'} · future-dated entries are excluded until their day.</p></div></div>
        <div className="xp-summary-grid">
          <div><span>Today</span><strong>{numberFormat.format(todayTotals.xp)} XP</strong></div>
          <div><span>This week</span><strong>{numberFormat.format(weekTotals.xp)} XP</strong></div>
          <div><span>This month</span><strong>{numberFormat.format(monthTotals.xp)} XP</strong></div>
          <div><span>Average / active day</span><strong>{numberFormat.format(dailyXp)} XP</strong></div>
          <div><span>Highest XP day</span><strong>{highest ? numberFormat.format(highest[1].xp) + ' XP' : '—'}</strong><small>{highest ? formatDate(highest[0], { month: 'short', day: 'numeric', year: 'numeric' }) : 'No sessions yet'}</small></div>
        </div>
      </section>

      <div className="insights-grid">
        <StudyBarChart sessions={sessions.filter((session) => session.date <= today)} today={today} />
        <SubjectBreakdown sessions={sessions} />
      </div>

      <section className="card streak-card">
        <div className="streak-copy"><div className="streak-icon"><Flame size={20} /></div><div><p className="eyebrow">CONSISTENCY, NOT PERFECTION</p><h2>Your study streak</h2><p className="section-subtitle">A day counts when you have logged at least one minute of study.</p></div></div>
        <div className="streak-values"><div><strong>{streaks.current}</strong><span>Current streak<br />{streaks.current === 1 ? 'day' : 'days'}</span></div><div><strong>{streaks.longest}</strong><span>Longest streak<br />{streaks.longest === 1 ? 'day' : 'days'}</span></div></div>
      </section>
      <p className="transparency-note"><ShieldCheck size={15} /> Untracked time is never treated as wasted time. Productivity only compares study and wasted minutes you chose to record.</p>
    </div>
  );
}

function ThresholdSettings({ thresholds, onSave }: { thresholds: XPThresholds; onSave: (thresholds: XPThresholds) => void }) {
  const [values, setValues] = useState<XPThresholds>({ ...thresholds });
  const [message, setMessage] = useState('');
  useEffect(() => setValues({ ...thresholds }), [thresholds]);
  const keys: (keyof XPThresholds)[] = ['level1', 'level2', 'level3', 'level4', 'level5'];
  const names = ['Starting', 'Building', 'Steady', 'Strong', 'Exceptional'];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numbers = keys.map((key) => values[key]);
    if (numbers.some((number) => !Number.isSafeInteger(number) || number < 0)) {
      setMessage('Enter non-negative whole-number XP thresholds.');
      return;
    }
    if (numbers.some((number, index) => index > 0 && number <= numbers[index - 1])) {
      setMessage('Each level must be higher than the one before it.');
      return;
    }
    onSave(values);
    setMessage('Heatmap thresholds saved.');
  }

  return (
    <form className="threshold-form" onSubmit={submit}>
      <div className="threshold-explainer"><span>0</span><div className="threshold-swatches">{[0, 1, 2, 3, 4, 5].map((level) => <i className={`heat-cell heat-level-${level}`} key={level} />)}</div><span>more XP</span></div>
      <div className="threshold-list">
        {keys.map((key, index) => <label className="threshold-row" key={key}><span className={`threshold-dot heat-level-${index + 1}`} /><span><strong>Level {index + 1}</strong><small>{names[index]}</small></span><div className="threshold-input"><input type="number" min="0" step="1" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: Number(event.target.value) }))} aria-label={`Level ${index + 1} XP threshold`} /><span>XP / day</span></div></label>)}
      </div>
      {message && <p className={`inline-message${message.includes('saved') ? ' success-text' : ' form-error'}`} role="status">{message}</p>}
      <div className="threshold-footer"><p>These thresholds only change the heatmap colours, not your XP totals.</p><button className="button button-secondary" type="submit"><Check size={15} /> Save thresholds</button></div>
    </form>
  );
}

function SettingsPage({
  snapshot,
  authEnabled,
  onSaveThresholds,
  onExportJSON,
  onExportCSV,
  onImport,
  onClear,
}: {
  snapshot: LocalSnapshot;
  authEnabled: boolean;
  onSaveThresholds: (thresholds: XPThresholds) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onImport: () => void;
  onClear: () => void;
}) {
  return (
    <div className="page-stack settings-page">
      <section className="page-title-row"><div><p className="eyebrow">YOUR PREFERENCES</p><h1>Settings & data</h1><p>Keep your tracker yours. No account database, no external storage.</p></div><div className="local-storage-badge"><ShieldCheck size={16} /><span>Stored on this device</span></div></section>

      <section className="card settings-card backup-card">
        <div className="section-heading"><div><p className="eyebrow">BACKUP & RESTORE</p><h2>Your data belongs to you</h2><p className="section-subtitle">Your study data is stored locally in this browser. Export a backup regularly.</p></div><div className="settings-icon"><Download size={19} /></div></div>
        <div className="backup-actions">
          <button className="backup-action" type="button" onClick={onExportJSON}><span className="backup-file-icon json-icon"><FileJson size={20} /></span><span><strong>Export JSON</strong><small>Full backup, including preferences</small></span><Download size={16} /></button>
          <button className="backup-action" type="button" onClick={onExportCSV}><span className="backup-file-icon csv-icon"><FileSpreadsheet size={20} /></span><span><strong>Export CSV</strong><small>Open your sessions in a spreadsheet</small></span><Download size={16} /></button>
          <button className="backup-action" type="button" onClick={onImport}><span className="backup-file-icon import-icon"><Upload size={20} /></span><span><strong>Import JSON backup</strong><small>Replaces local records and preferences</small></span><ArrowRight size={16} /></button>
        </div>
        <div className="storage-note"><ShieldCheck size={16} /><p><strong>Local by design.</strong> Data lives in this browser's local storage. Clearing browser data or switching devices can remove it; keep a JSON backup somewhere safe.</p></div>
      </section>

      <section className="card settings-card">
        <div className="section-heading"><div><p className="eyebrow">CALENDAR</p><h2>XP heatmap thresholds</h2><p className="section-subtitle">Set the minimum XP for each colour. A day with no XP remains the empty level.</p></div><div className="settings-icon"><BarChart3 size={19} /></div></div>
        <ThresholdSettings thresholds={snapshot.preferences.thresholds} onSave={onSaveThresholds} />
      </section>

      <section className="card settings-card access-card">
        <div className="section-heading"><div><p className="eyebrow">ACCESS & PRIVACY</p><h2>{authEnabled ? 'Personal password enabled' : 'Personal password not configured'}</h2><p className="section-subtitle">A private-access gate for your personal deployment.</p></div><div className={`access-status ${authEnabled ? 'access-on' : 'access-off'}`}><span />{authEnabled ? 'Enabled' : 'Open access'}</div></div>
        {authEnabled ? (
          <p className="access-copy">The password is checked by a Vercel serverless route and the signed session cookie is HttpOnly. The password is not included in the browser bundle. This protects the app entry point; it does not encrypt data in browser storage.</p>
        ) : (
          <div className="access-copy"><p>To enable the login screen on Vercel, set <code>STUDYTRACK_PASSWORD</code> and <code>STUDYTRACK_AUTH_SECRET</code> as server-side environment variables, then redeploy. Do not use a <code>NEXT_PUBLIC_</code> prefix.</p><p>Without these values the tracker is open to anyone who can visit its URL. A frontend-only password is not secure, so none is used here.</p></div>
        )}
      </section>

      <section className="card danger-zone">
        <div><p className="eyebrow danger-eyebrow">DESTRUCTIVE ACTION</p><h2>Clear all data</h2><p>This permanently removes every session and resets your preferences from this browser. Export a backup first if you may need it.</p></div>
        <button className="button button-danger" type="button" onClick={onClear}><Trash2 size={16} /> Clear all data</button>
      </section>
      <p className="settings-session-count">{numberFormat.format(snapshot.sessions.length)} {snapshot.sessions.length === 1 ? 'session' : 'sessions'} stored in this browser.</p>
    </div>
  );
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal-card${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading"><div><p className="eyebrow">STUDYTRACK</p><h2>{title}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
        {children}
      </section>
    </div>
  );
}

function DayDetailsModal({ date, sessions, onClose, onOpenDate }: { date: string; sessions: StudySession[]; onClose: () => void; onOpenDate: (date: string) => void }) {
  const totals = totalsForDay(sessions, date);
  const subjects = subjectTotals(totals.sessions, 'time');
  return (
    <Modal title={formatDate(date)} onClose={onClose} wide>
      <div className="day-detail-stats">
        <div><span>Study</span><strong>{formatDuration(totals.studyMinutes)}</strong></div>
        <div><span>XP</span><strong>{numberFormat.format(totals.xp)}</strong></div>
        <div><span>Sessions</span><strong>{totals.sessions.length}</strong></div>
        <div><span>Wasted</span><strong>{formatDuration(totals.wastedMinutes)}</strong></div>
      </div>
      {subjects.length > 0 ? <div className="day-detail-columns">
        <section><h3>Subject time</h3><div className="detail-subject-list">{subjects.map((subject) => <div key={subject.subject}><span>{subject.subject}</span><strong>{formatDuration(subject.value)}</strong></div>)}</div></section>
        <section><h3>Sessions</h3><div className="detail-session-list">{totals.sessions.map((session) => <article key={session.id}><div className="detail-session-top"><strong>{session.subject}</strong><span>{formatClockTime(session.time)}</span></div><p>{session.topic}</p><div className="detail-session-meta"><span>{formatDuration(session.durationMinutes)}</span><span>+{numberFormat.format(session.xp)} XP</span>{session.wastedMinutes > 0 && <span>{formatDuration(session.wastedMinutes)} wasted</span>}</div>{session.notes && <p className="detail-note">{session.notes}</p>}</article>)}</div></section>
      </div> : <div className="empty-state modal-empty"><div className="empty-icon"><BookOpen size={20} /></div><h3>No study sessions on this date.</h3><p>Nothing is estimated for days without a saved record.</p></div>}
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => onOpenDate(date)}>Open this day in dashboard <ArrowRight size={15} /></button></div>
    </Modal>
  );
}

export function StudyApp({ authEnabled }: { authEnabled: boolean }) {
  const [snapshot, setSnapshot] = useState<LocalSnapshot>(() => emptySnapshot());
  const [hydrated, setHydrated] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [today, setToday] = useState('');
  const [activePage, setActivePage] = useState<PageKey>('dashboard');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [storageError, setStorageError] = useState('');
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);
  const [dayDetails, setDayDetails] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [clearPhrase, setClearPhrase] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const allowPersist = useRef(true);

  useEffect(() => {
    const loaded = readLocalSnapshot();
    allowPersist.current = !loaded.error;
    setSnapshot(loaded.snapshot);
    const localToday = localDateISO(new Date());
    setToday(localToday);
    setSelectedDate(localToday);
    if (loaded.error) setStorageError(loaded.error);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !allowPersist.current) return;
    try {
      writeLocalSnapshot(snapshot);
      setStorageError((current) => current.startsWith('Could not save') ? '' : current);
    } catch {
      setStorageError('Could not save to this browser. Check available storage space and export a backup if possible.');
    }
  }, [snapshot, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dayStats = useMemo(() => totalsForDay(snapshot.sessions, selectedDate), [snapshot.sessions, selectedDate]);
  const allTimeTotals = useMemo(() => totalOf(snapshot.sessions), [snapshot.sessions]);

  function announce(text: string, tone: ToastMessage['tone'] = 'success') {
    setToast({ text, tone });
  }

  function commit(next: LocalSnapshot) {
    allowPersist.current = true;
    setStorageError((current) => current.startsWith('Saved data could not be loaded') ? '' : current);
    setSnapshot(next);
  }

  function saveSession(draft: SessionDraft, existing?: StudySession) {
    const timestamp = new Date().toISOString();
    const session: StudySession = {
      ...draft,
      id: existing?.id ?? globalThis.crypto.randomUUID(),
      createdAt: existing?.createdAt ?? timestamp,
      ...(existing ? { updatedAt: timestamp } : {}),
    };
    const sessions = existing
      ? snapshot.sessions.map((item) => item.id === existing.id ? session : item)
      : [...snapshot.sessions, session];
    commit({ ...snapshot, sessions });
    setSelectedDate(draft.date);
    if (existing) {
      setEditingSession(null);
      announce('Session updated. Daily totals recalculated.');
    } else {
      announce(`Session saved · ${formatDuration(draft.durationMinutes)} and ${numberFormat.format(draft.xp)} XP recorded.`);
    }
  }

  function deleteSession(session: StudySession) {
    commit({ ...snapshot, sessions: snapshot.sessions.filter((item) => item.id !== session.id) });
    setConfirmAction(null);
    announce('Session deleted. Daily totals recalculated.');
  }

  function exportJSON() {
    const payload = {
      ...snapshot,
      app: 'StudyTrack',
      exportedAt: new Date().toISOString(),
    };
    downloadFile('study-data.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    announce('JSON backup downloaded. Keep it somewhere safe.');
  }

  function exportCSV() {
    const rows = [
      ['Date', 'Subject', 'Topic', 'Study Time', 'XP', 'Wasted Time', 'Notes'],
      ...[...snapshot.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map((session) => [
        session.date,
        session.subject,
        session.topic,
        formatDuration(session.durationMinutes),
        String(session.xp),
        formatDuration(session.wastedMinutes),
        session.notes,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    downloadFile('study-data.csv', `\uFEFF${csv}`, 'text/csv;charset=utf-8');
    announce('CSV export downloaded.');
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('Backup is larger than 15 MB.');
      const parsed = normalizeSnapshot(JSON.parse(await file.text()) as unknown);
      setConfirmAction({ type: 'import', snapshot: parsed.snapshot, duplicates: parsed.duplicates });
    } catch (error) {
      announce(error instanceof Error ? error.message : 'Could not read this backup file.', 'error');
    }
  }

  function confirmImport(action: Extract<ConfirmAction, { type: 'import' }>) {
    commit(action.snapshot);
    setConfirmAction(null);
    announce(`Imported ${numberFormat.format(action.snapshot.sessions.length)} sessions. Previous local data was replaced.`);
  }

  function clearAll() {
    commit(emptySnapshot());
    setConfirmAction(null);
    setClearPhrase('');
    setSelectedDate(today || localDateISO());
    setDayDetails(null);
    announce('All local sessions and preferences were cleared.', 'info');
  }

  function saveThresholds(thresholds: XPThresholds) {
    commit({ ...snapshot, preferences: { ...snapshot.preferences, thresholds: { ...thresholds } } });
    announce('Heatmap thresholds updated.');
  }

  function toggleTheme() {
    commit({ ...snapshot, preferences: { ...snapshot.preferences, theme: snapshot.preferences.theme === 'light' ? 'dark' : 'light' } });
  }

  async function logout() {
    setLogoutBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.reload();
    }
  }

  if (!hydrated) {
    return <main className="boot-screen"><div className="boot-mark"><BookOpen size={20} /></div><span>Opening your study log…</span></main>;
  }

  const navItems: { key: PageKey; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { key: 'insights', label: 'Insights', icon: <BarChart3 size={16} /> },
    { key: 'settings', label: 'Settings & data', icon: <ShieldCheck size={16} /> },
  ];

  return (
    <div className="app-shell" data-theme={snapshot.preferences.theme}>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand-lockup" type="button" onClick={() => setActivePage('dashboard')} aria-label="StudyTrack dashboard">
            <span className="brand-mark"><BookOpen size={18} strokeWidth={2.2} /></span><span className="brand-name">studytrack<span className="brand-period">.</span></span>
          </button>
          <nav className="main-nav" aria-label="Main navigation">
            {navItems.map((item) => <button className={`nav-link${activePage === item.key ? ' active' : ''}`} type="button" key={item.key} onClick={() => setActivePage(item.key)} aria-current={activePage === item.key ? 'page' : undefined}>{item.icon}<span>{item.label}</span></button>)}
          </nav>
          <div className="topbar-actions">
            <span className="privacy-chip"><span className="privacy-dot" />Local only</span>
            <button className="icon-button theme-button" type="button" title={snapshot.preferences.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} aria-label={snapshot.preferences.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} onClick={toggleTheme}>{snapshot.preferences.theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button>
            {authEnabled && <button className="icon-button logout-button" type="button" title="Sign out" aria-label="Sign out" disabled={logoutBusy} onClick={logout}>{logoutBusy ? <span className="spinner" /> : <LogOut size={16} />}</button>}
          </div>
        </div>
      </header>

      <main className="main-content">
        {storageError && <div className="storage-error-banner" role="alert"><span>{storageError}</span><button className="icon-button" type="button" aria-label="Dismiss storage message" onClick={() => setStorageError('')}><X size={15} /></button></div>}
        {activePage === 'dashboard' && (
          <DashboardPage
            sessions={snapshot.sessions}
            selectedDate={selectedDate}
            today={today}
            thresholds={snapshot.preferences.thresholds}
            onDateChange={setSelectedDate}
            onEdit={setEditingSession}
            onDelete={(session) => setConfirmAction({ type: 'delete', session })}
            onSelectCalendarDay={(date) => { setSelectedDate(date); setDayDetails(date); }}
            onAdd={(draft) => saveSession(draft)}
          />
        )}
        {activePage === 'insights' && <InsightsPage sessions={snapshot.sessions} today={today} />}
        {activePage === 'settings' && (
          <SettingsPage
            snapshot={snapshot}
            authEnabled={authEnabled}
            onSaveThresholds={saveThresholds}
            onExportJSON={exportJSON}
            onExportCSV={exportCSV}
            onImport={() => importInput.current?.click()}
            onClear={() => { setClearPhrase(''); setConfirmAction({ type: 'clear' }); }}
          />
        )}
      </main>
      <footer className="app-footer"><span>StudyTrack</span><span>Study honestly. Progress follows.</span><span>{numberFormat.format(allTimeTotals.count)} logged sessions</span></footer>

      <input ref={importInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={handleImportFile} />

      {toast && <div className={`toast toast-${toast.tone}`} role="status"><span className="toast-check">{toast.tone === 'success' ? <Check size={15} /> : toast.tone === 'error' ? <X size={15} /> : <ShieldCheck size={15} />}</span><span>{toast.text}</span><button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={14} /></button></div>}

      {editingSession && <Modal title="Edit study session" onClose={() => setEditingSession(null)} wide><SessionForm key={editingSession.id} date={editingSession.date} initialSession={editingSession} onSave={(draft) => saveSession(draft, editingSession)} onCancel={() => setEditingSession(null)} submitLabel="Save changes" compact /></Modal>}
      {dayDetails && <DayDetailsModal date={dayDetails} sessions={snapshot.sessions} onClose={() => setDayDetails(null)} onOpenDate={(date) => { setSelectedDate(date); setDayDetails(null); setActivePage('dashboard'); }} />}
      {confirmAction?.type === 'delete' && <Modal title="Delete this session?" onClose={() => setConfirmAction(null)}><p className="confirm-copy">This will remove <strong>{confirmAction.session.subject} — {confirmAction.session.topic}</strong> from your local log. Your day totals will be recalculated.</p><div className="confirm-actions"><button className="button button-quiet" type="button" onClick={() => setConfirmAction(null)}>Keep session</button><button className="button button-danger" type="button" onClick={() => deleteSession(confirmAction.session)}><Trash2 size={15} /> Delete session</button></div></Modal>}
      {confirmAction?.type === 'clear' && <Modal title="Clear all local data?" onClose={() => { setConfirmAction(null); setClearPhrase(''); }}><p className="confirm-copy">This permanently deletes <strong>all saved sessions and preferences</strong> in this browser. It cannot be undone unless you have a backup.</p><label className="confirm-label" htmlFor="clear-confirm">Type <strong>DELETE</strong> to confirm</label><input id="clear-confirm" className="confirm-input" value={clearPhrase} onChange={(event) => setClearPhrase(event.target.value)} placeholder="DELETE" autoComplete="off" /><div className="confirm-actions"><button className="button button-quiet" type="button" onClick={() => { setConfirmAction(null); setClearPhrase(''); }}>Cancel</button><button className="button button-danger" type="button" disabled={clearPhrase !== 'DELETE'} onClick={clearAll}><Trash2 size={15} /> Clear all data</button></div></Modal>}
      {confirmAction?.type === 'import' && <Modal title="Replace local data?" onClose={() => setConfirmAction(null)}><p className="confirm-copy">This backup contains <strong>{numberFormat.format(confirmAction.snapshot.sessions.length)} sessions</strong> and will replace all sessions and preferences currently stored in this browser.</p>{confirmAction.duplicates > 0 && <p className="import-dedup-note">{confirmAction.duplicates} duplicate session ID{confirmAction.duplicates === 1 ? ' was' : 's were'} ignored in the backup.</p>}<div className="confirm-actions"><button className="button button-quiet" type="button" onClick={() => setConfirmAction(null)}>Cancel</button><button className="button button-primary" type="button" onClick={() => confirmImport(confirmAction)}><Upload size={15} /> Replace & import</button></div></Modal>}
    </div>
  );
}

function csvCell(value: string) {
  let text = String(value);
  // Spreadsheet apps can execute formula-like text from user-entered topics/notes.
  const first = text.charCodeAt(0);
  if ('=+-@'.includes(text[0] ?? '') || first === 9 || first === 13) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
