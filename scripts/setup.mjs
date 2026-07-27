// Idempotent Appwrite provisioning + seed for the Rockstadt REF app.
// Creates tables, indexes, the admins team, global tags, uploads day posters,
// and seeds the full timetable. Safe to re-run: existing resources are kept,
// concert rows are upserted by deterministic id.
import { Client, TablesDB, Teams, Storage } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const envFile of [".env.local", ".env"]) {
  if (!existsSync(resolve(root, envFile))) continue;
  for (const line of readFileSync(resolve(root, envFile), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const {
  APPWRITE_ENDPOINT: endpoint,
  APPWRITE_PROJECT_ID: project,
  APPWRITE_DATABASE_ID: databaseId,
  APPWRITE_BUCKET_ID: bucketId,
  APPWRITE_API_KEY: apiKey,
} = process.env;

const client = new Client().setEndpoint(endpoint).setProject(project).setKey(apiKey);
const tables = new TablesDB(client);
const teams = new Teams(client);
const storage = new Storage(client);

const ok = (msg) => console.log(`  ✔ ${msg}`);
const skip = (msg) => console.log(`  – ${msg} (exists)`);

async function ensure(fn, existsMsg) {
  try {
    await fn();
    return true;
  } catch (e) {
    const dupIndex = e?.code === 400 && /already an index/i.test(e?.message ?? "");
    if (e?.code === 409 || dupIndex) {
      skip(existsMsg);
      return false;
    }
    throw e;
  }
}

async function waitForColumns(tableId) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await tables.listColumns({ databaseId, tableId });
    if (columns.every((c) => c.status === "available")) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`columns of ${tableId} never became available`);
}

console.log("Tables");

await ensure(
  () => tables.createTable({ databaseId, tableId: "stages", name: "Stages" }),
  "stages"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "stages", key: "name", size: 128, required: true }),
  "stages.name"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "stages", key: "color", size: 16, required: true }),
  "stages.color"
);
await ensure(
  () => tables.createIntegerColumn({ databaseId, tableId: "stages", key: "sortOrder", required: true }),
  "stages.sortOrder"
);

await ensure(
  () => tables.createTable({ databaseId, tableId: "concerts", name: "Concerts" }),
  "concerts"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "concerts", key: "band", size: 256, required: true }),
  "concerts.band"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "concerts", key: "stageId", size: 64, required: true }),
  "concerts.stageId"
);
await ensure(
  () => tables.createIntegerColumn({ databaseId, tableId: "concerts", key: "day", required: true }),
  "concerts.day"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "concerts", key: "date", size: 10, required: true }),
  "concerts.date"
);
await ensure(
  () => tables.createDatetimeColumn({ databaseId, tableId: "concerts", key: "startsAt", required: true }),
  "concerts.startsAt"
);
await ensure(
  () => tables.createDatetimeColumn({ databaseId, tableId: "concerts", key: "endsAt", required: false }),
  "concerts.endsAt"
);
await ensure(
  () => tables.createBooleanColumn({ databaseId, tableId: "concerts", key: "openEnded", required: false, xdefault: false }),
  "concerts.openEnded"
);

await ensure(
  () => tables.createTable({ databaseId, tableId: "tags", name: "Tags" }),
  "tags"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "tags", key: "name", size: 64, required: true }),
  "tags.name"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "tags", key: "slug", size: 64, required: true }),
  "tags.slug"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "tags", key: "color", size: 16, required: true }),
  "tags.color"
);
// "_global" sentinel = system tag editable only by admins; otherwise the owning user's id
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "tags", key: "ownerId", size: 64, required: true }),
  "tags.ownerId"
);

await ensure(
  () => tables.createTable({ databaseId, tableId: "tag_assignments", name: "Tag assignments" }),
  "tag_assignments"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "tag_assignments", key: "userId", size: 64, required: true }),
  "tag_assignments.userId"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "tag_assignments", key: "concertId", size: 64, required: true }),
  "tag_assignments.concertId"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "tag_assignments", key: "tagId", size: 64, required: true }),
  "tag_assignments.tagId"
);
// active=false is a tombstone so offline clients can sync removals (LWW by clientUpdatedAt)
await ensure(
  () => tables.createBooleanColumn({ databaseId, tableId: "tag_assignments", key: "active", required: true }),
  "tag_assignments.active"
);
await ensure(
  () => tables.createDatetimeColumn({ databaseId, tableId: "tag_assignments", key: "clientUpdatedAt", required: true }),
  "tag_assignments.clientUpdatedAt"
);

await ensure(
  () => tables.createTable({ databaseId, tableId: "calendars", name: "Saved calendars" }),
  "calendars"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "calendars", key: "ownerId", size: 64, required: true }),
  "calendars.ownerId"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "calendars", key: "name", size: 128, required: true }),
  "calendars.name"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "calendars", key: "tagIds", size: 64, required: false, array: true }),
  "calendars.tagIds"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "calendars", key: "shareToken", size: 64, required: false }),
  "calendars.shareToken"
);
await ensure(
  () => tables.createBooleanColumn({ databaseId, tableId: "calendars", key: "shareEnabled", required: false, xdefault: false }),
  "calendars.shareEnabled"
);
await ensure(
  () => tables.createBooleanColumn({ databaseId, tableId: "calendars", key: "isDefault", required: false, xdefault: false }),
  "calendars.isDefault"
);

// Frozen snapshots back anonymous shares (no account to serve live data from).
await ensure(
  () => tables.createTable({ databaseId, tableId: "snapshots", name: "Shared snapshots" }),
  "snapshots"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "snapshots", key: "name", size: 128, required: true }),
  "snapshots.name"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "snapshots", key: "data", size: 300000, required: true }),
  "snapshots.data"
);
await ensure(
  () => tables.createStringColumn({ databaseId, tableId: "snapshots", key: "secret", size: 64, required: true }),
  "snapshots.secret"
);

console.log("Waiting for columns…");
for (const t of ["stages", "concerts", "tags", "tag_assignments", "calendars", "snapshots"]) await waitForColumns(t);
ok("all columns available");

console.log("Indexes");
await ensure(
  () => tables.createIndex({ databaseId, tableId: "concerts", key: "byDay", type: "key", columns: ["day"] }),
  "concerts.byDay"
);
await ensure(
  () => tables.createIndex({ databaseId, tableId: "tags", key: "byOwner", type: "key", columns: ["ownerId"] }),
  "tags.byOwner"
);
await ensure(
  () => tables.createIndex({ databaseId, tableId: "tags", key: "ownerSlug", type: "unique", columns: ["ownerId", "slug"] }),
  "tags.ownerSlug"
);
await ensure(
  () => tables.createIndex({ databaseId, tableId: "tag_assignments", key: "byUser", type: "key", columns: ["userId"] }),
  "tag_assignments.byUser"
);
await ensure(
  () => tables.createIndex({ databaseId, tableId: "calendars", key: "byOwner", type: "key", columns: ["ownerId"] }),
  "calendars.byOwner"
);
await ensure(
  () => tables.createIndex({ databaseId, tableId: "calendars", key: "byToken", type: "key", columns: ["shareToken"] }),
  "calendars.byToken"
);

console.log("Admins team");
await ensure(() => teams.create({ teamId: "admins", name: "Admins" }), "admins team");

console.log("Global tags");
const GLOBAL_TAGS = [
  { slug: "wanna-see", name: "Wanna see", color: "#e3b341" },
  { slug: "must-see", name: "Must see", color: "#f0483e" },
  { slug: "maybe", name: "Maybe", color: "#7d8590" },
];
for (const t of GLOBAL_TAGS) {
  await ensure(
    () =>
      tables.createRow({
        databaseId,
        tableId: "tags",
        rowId: `g-${t.slug}`,
        data: { ...t, ownerId: "_global" },
      }),
    `tag ${t.slug}`
  );
}

console.log("Seed timetable");
const timetable = JSON.parse(readFileSync(resolve(root, "data/timetable.json"), "utf8"));

for (const s of timetable.stages) {
  await ensure(
    () =>
      tables.createRow({
        databaseId,
        tableId: "stages",
        rowId: s.slug,
        data: { name: s.name, color: stageHex(s.color), sortOrder: timetable.stages.indexOf(s) },
      }),
    `stage ${s.slug}`
  );
}

function stageHex(color) {
  return { green: "#6abf2e", magenta: "#c320c9", orange: "#e07020" }[color] ?? "#7d8590";
}

// Festival runs in EEST (UTC+3) throughout; sets starting before 05:00 belong to the next calendar date.
function toInstant(dayDate, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const t = new Date(`${dayDate}T${hh}:${mm}:00+03:00`).getTime();
  return new Date(h < 5 ? t + 24 * 3600_000 : t).toISOString();
}

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

let upserted = 0;
for (const day of timetable.days) {
  for (const set of day.sets) {
    const rowId = `d${day.day}-${slugify(set.band)}`;
    const openEnded = set.end == null;
    await tables.upsertRow({
      databaseId,
      tableId: "concerts",
      rowId,
      data: {
        band: set.band,
        stageId: set.stage,
        day: day.day,
        date: day.date,
        startsAt: toInstant(day.date, set.start),
        endsAt: openEnded
          ? toInstant(day.date, addHour(set.start))
          : toInstant(day.date, set.end),
        openEnded,
      },
    });
    upserted++;
  }
}
ok(`${upserted} concerts upserted`);

function addHour(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

console.log("Posters → bucket");
for (let d = 1; d <= 6; d++) {
  const p = resolve(root, `data/posters/d${d}.jpg`);
  if (!existsSync(p)) continue;
  await ensure(
    () =>
      storage.createFile({
        bucketId,
        fileId: `poster-d${d}`,
        file: InputFile.fromPath(p, `poster-d${d}.jpg`),
      }),
    `poster d${d}`
  );
}

console.log("\nDone.");
