import Dexie, { type EntityTable } from "dexie";
import type { SavedCalendar, Schedule, SessionUser, Tag } from "../types";

export type LocalAssignment = {
  key: string; // `${concertId}|${tagId}`
  concertId: string;
  tagId: string;
  active: boolean;
  clientUpdatedAt: string;
  dirty: number; // 1 = not yet accepted by the server
};

export type TagOp =
  | { id?: number; op: "create"; localId: string; name: string; color: string }
  | { id?: number; op: "update"; tagId: string; name?: string; color?: string }
  | { id?: number; op: "delete"; tagId: string };

// Flat shape (not a discriminated union): Dexie's InsertType drops
// union-specific properties, which breaks put() typing.
export type CalendarOp = {
  id?: number;
  op: "create" | "update" | "delete";
  localId?: string;
  calendarId?: string;
  name?: string;
  tagIds?: string[];
};

export type KvRow = { key: string; value: unknown };

export const db = new Dexie("rockstadt-ref") as Dexie & {
  kv: EntityTable<KvRow, "key">;
  tags: EntityTable<Tag, "id">;
  assignments: EntityTable<LocalAssignment, "key">;
  tagOps: EntityTable<TagOp & { id: number }, "id">;
  calendars: EntityTable<SavedCalendar, "id">;
  calOps: EntityTable<CalendarOp & { id: number }, "id">;
};

db.version(1).stores({
  kv: "key",
  tags: "id, ownerId",
  assignments: "key, concertId, tagId, dirty",
  tagOps: "++id",
});

db.version(2).stores({
  calendars: "id, ownerId",
  calOps: "++id",
});

export const asgKey = (concertId: string, tagId: string) => `${concertId}|${tagId}`;

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

export type CachedState = {
  schedule?: Schedule;
  user?: SessionUser | null;
};
