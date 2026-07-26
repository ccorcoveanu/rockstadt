# Rockstadt Extreme Fest 2026 — Schedule Planner

Offline-first, poster-styled schedule planner for [Rockstadt Extreme Fest](https://rockstadtextremefest.ro/) (12th edition, 27–31 July 2026 + Tribute Day 1 Aug, Ghimbav, Romania).

Next.js (App Router, SSR) + Appwrite. The browser only ever talks to the app's own `/api/*` routes; all Appwrite access happens server-side with the API key. The one unavoidable exception is the Google OAuth redirect bounce through Appwrite's OAuth endpoint (protocol requirement) — session creation still happens server-side.

## Features

- **Calendar**: desktop stage-grid (3 columns, vertical time axis 14:00→03:30, like the official posters), mobile agenda list. Day tabs incl. Tribute Day.
- **Tags**: global tags (admin-managed: *Wanna see*, *Must see*, *Maybe*, …) + per-user tags. Filter the calendar by any tag combination; concerts outside the filter dim, overlapping tagged sets glow red (clash detection).
- **Auth optional**: email+password and Google login via Appwrite. Anonymous users get full functionality stored locally (IndexedDB); on login local tags/assignments merge into the account.
- **Offline-first PWA**: service worker precaches the shell; schedule/tags/assignments live in IndexedDB (Dexie); offline mutations queue and replay on reconnect with last-write-wins per (concert, tag). Sync state shown in the header.
- **Saved calendars**: name any tag selection and save it (device-local when anonymous, synced when signed in). One click re-applies it.
- **Sharing**: a saved calendar gets a revocable link (`/c/<token>`, account required — the server must answer while you're in the pit). The link is live: it always serves the owner's current tags/picks. Visitors get an import popup with a personal-name field; importing clones user tags (matching by slug), maps global tags to themselves, applies the picks, and saves the calendar locally — works for anonymous visitors too.
- **Admin** (`/admin`): edit the schedule (add/edit/delete sets) and global tags. Gated by membership in the Appwrite `admins` team.

## Setup

```bash
cp .env.example .env.local   # fill in Appwrite ids + API key
npm install
npm run setup                # idempotent: tables, indexes, admins team, seed timetable + posters
npm run build && npm start
```

`npm run dev` for development (service worker only registers in production builds).

### Env vars

| Var | Meaning |
| --- | --- |
| `APPWRITE_ENDPOINT` | e.g. `http://localhost:9080/v1` (local Appwrite behind traefik) |
| `APPWRITE_PROJECT_ID` / `APPWRITE_DATABASE_ID` / `APPWRITE_BUCKET_ID` | Appwrite resources |
| `APPWRITE_API_KEY` | server API key (never shipped to the client) |
| `NEXT_PUBLIC_APP_URL` | public origin, used for OAuth redirects |

### Make yourself admin

Appwrite Console → Auth → Teams → `admins` → add your user (membership must be confirmed). The `/admin` link appears in the header user menu.

### Google login

Appwrite Console → Auth → Settings → enable the **Google** OAuth2 provider with your Google client id/secret. Add `NEXT_PUBLIC_APP_URL` as a Web platform on the project so the redirect is allowed. The app then works out of the box (`/api/auth/oauth/google` starts the token flow, `/api/auth/oauth/callback` creates the session cookie).

## Data model (Appwrite TablesDB)

- `stages` — id = slug, name, color, sortOrder.
- `concerts` — band, stageId, day (1–6), date (festival day), startsAt/endsAt (UTC instants; the festival runs entirely in EEST/UTC+3), openEnded (last DJ set has no published end).
- `tags` — name, slug, color, ownerId (`_global` sentinel = system tag; otherwise the owning user id). Unique index on (ownerId, slug).
- `tag_assignments` — userId, concertId, tagId, active, clientUpdatedAt. Row id = sha256(user|concert|tag) → idempotent upserts. `active:false` rows are tombstones so offline removals sync; conflict resolution is last-write-wins on `clientUpdatedAt`.
- `calendars` — ownerId, name, tagIds[], shareToken, shareEnabled. The share endpoint mints a random token once and toggles `shareEnabled`; `/api/shares/[token]` serves a live snapshot only while enabled.

## Sync design

IndexedDB (Dexie) is the UI's source of truth. Server reconciliation happens in the background:

1. Toggles write locally with `dirty=1` and push immediately when online + signed in.
2. Offline/anonymous writes accumulate; the `online` event (or login) replays queued tag ops (create/rename/delete) first — remapping local tag ids to server ids — then pushes dirty assignments in one batch.
3. The server answers with the surviving rows (LWW); the client clears `dirty` only when its exact write survived.
4. On logout, personal data is wiped from the device; global tags and the schedule stay cached.

Timetable source: extracted from the six official poster images (`data/timetable.json`, seeded by `scripts/setup.mjs`; posters also uploaded to the storage bucket and proxied at `/api/posters/[1-6]`).

## Share links and the installed PWA

Share links live under the app's manifest scope, and the manifest sets `launch_handler: navigate-existing`. Where the OS supports link capturing (Android/ChromeOS, desktop Chrome when the user enables "open in app"), tapping a share link opens the installed app; everywhere else (notably iOS) it opens in the browser — which is fully functional, offline-capable, and syncs aggressively: on every mutation, on reconnect, on tab focus/visibility, and every 5 minutes while visible, with last-write-wins reconciliation. There is no web API that can force-open an installed PWA from a browser link.

## Notes

- `npm audit` reports high-severity findings in transitive dev/build dependencies of the latest Next.js/ESLint; the proposed "fixes" downgrade Next to v9. Nothing ships those paths at runtime — revisit when upstream bumps them.
- The service worker is hand-rolled (`public/sw.js`): Serwist's Next plugin is webpack-only while this app builds with Turbopack, and for a single-page app runtime caching covers the same assets its precache manifest would.
