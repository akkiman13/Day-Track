# StudyTrack

A personal study-time dashboard built with Next.js and TypeScript. Study sessions, XP, notes, settings, and backups are stored in the browser—there is **no external database** and no paid service is required.

## Features

- Log study sessions with subject, topic, duration, manually entered XP, optional wasted time/reason, notes, date, and local session time.
- Edit or delete individual sessions; totals are recalculated from the saved session records.
- Twelve-month, GitHub-style activity calendar whose colour is based on daily XP. The five XP cutoffs are editable in Settings.
- Daily, week-to-date, month-to-date, subject, XP, and study-streak insights.
- Productivity is calculated transparently as `study minutes ÷ (study minutes + recorded wasted minutes) × 100`. If no minutes have been recorded, it is shown as `—`.
- Untracked time is **not** treated as wasted time. No sessions, time, or XP are generated automatically.
- Light/dark theme, date navigation, JSON backup/restore, CSV export, and confirmed clear-data flow.

## Requirements

- Node.js 20.9 or newer (Node 20 LTS is recommended)
- npm

## Install and run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app starts without environment variables and without a database. To use the optional login locally, copy `.env.example` to `.env.local`, set both values, then restart the dev server.

To make a production build and run it locally:

```bash
npm run build
npm start
```

## Deploy to Vercel Free Tier

1. Push this project to a GitHub repository.
2. In Vercel, choose **Add New → Project**, import the repository, and keep the detected **Next.js** framework and default build settings.
3. (Recommended) Add the two server-side environment variables below under **Project → Settings → Environment Variables**. Do not add a `NEXT_PUBLIC_` prefix.
4. Deploy. The app uses Vercel's normal Next.js hosting and serverless route handlers only for the optional login/logout. Study records are never written to a Vercel function or server variable.

### Optional personal login environment variables

| Variable | Purpose |
| --- | --- |
| `STUDYTRACK_PASSWORD` | One personal password checked by the server-side login route. |
| `STUDYTRACK_AUTH_SECRET` | Random signing key for the HttpOnly session cookie. Use a long, private value (at least 32 random bytes). |

Generate a signing secret with, for example:

```bash
openssl rand -base64 32
```

Set both variables for the Vercel environments you use, then redeploy. When both are present, the app shows a login screen and issues a signed, HttpOnly, `SameSite=Lax` cookie for seven days. If no password is configured, the app is open to anyone who can reach its URL. If the password is set but the signing secret is missing or shorter than 32 bytes, the dashboard remains locked and displays a setup message. Never commit `.env.local` or put either value in a `NEXT_PUBLIC_` variable.

### Important authentication limitation

This is a lightweight, single-person access gate—not a multi-user identity system. It keeps the configured password out of frontend JavaScript and checks it on the server, but it does **not** encrypt browser data. Anyone who can use the unlocked browser profile or its developer tools can inspect that profile's local storage. The app has no database-backed users, password recovery, or enterprise session management. Use HTTPS, a strong password, and a device/browser profile you control. The login is optional; the tracker works locally without it.

## Where your data lives

The browser stores one versioned record at `localStorage['studytrack.local.v1']`. It contains the session list and preferences (theme and XP thresholds). Calculated totals are derived from the session list rather than saved separately, so edits/deletes do not leave stale totals. No study records are sent to an API, database, or analytics service. The Vercel functions only verify login and sign out; they do not hold study sessions in memory.

Local storage is per browser profile and origin. It does not automatically sync to another device, and browser cleanup/private browsing can remove it. **Export a JSON backup regularly**, and keep that file somewhere outside this browser.

## Backup and restore

- **Export JSON** downloads `study-data.json` with all sessions and preferences.
- **Import JSON** validates a StudyTrack version 1 backup and **replaces** the current local data after confirmation. It does not merge. Duplicate session IDs inside the backup are ignored, so restoring the same file cannot double-count records.
- **Export CSV** downloads `study-data.csv` with Date, Subject, Topic, Study Time, XP, Wasted Time, and Notes columns.
- **Clear all data** requires typing `DELETE` and removes sessions and preferences from this browser.

Treat the JSON backup as private: it contains your topics and notes in plain text.

## Statistics definitions

- A streak day requires at least one saved session with more than zero study minutes. The current streak is counted back from today, or from yesterday if there is no session today. Future-dated sessions do not extend a streak until their date arrives.
- Week and month cards are **to date** (Monday through today; the first of the month through today). Future-dated entries are excluded from those summaries and from historical XP totals until the date occurs.
- Average XP per active day divides XP by days with a logged study session. Average study time in the month divides month-to-date study minutes by the number of calendar days elapsed in the month, including days without a session.
- Subject breakdown includes all saved sessions. Productivity compares only the study and wasted minutes explicitly entered by you.

## Project structure

```text
app/                 Next.js app, server-rendered access gate, auth route handlers
components/           Client-side StudyTrack dashboard, entry form, calendar, insights, settings
lib/                  Browser storage validation, date helpers, shared types, server auth helpers
```

## Privacy and deployment notes

- No Supabase, Firebase, SQL/NoSQL database, Redis, paid API, Docker image, cron job, or separate backend server is used.
- The application is designed for Vercel's Free Tier. Browser local storage is the source of truth for personal study data.
- The default dashboard contains no sample records. A fresh install starts empty.
