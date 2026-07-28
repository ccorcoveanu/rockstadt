import type {
  CalendarSnapshot,
  SavedCalendar,
  Schedule,
  SessionUser,
  Tag,
  TagAssignment,
} from "../types";
import { GLOBAL_OWNER, slugifyTag } from "../types";
import { api, ApiError } from "./api";
import { asgKey, db, kvGet, kvSet, type LocalAssignment } from "./db";

// Offline-first store: IndexedDB is the source of truth for the UI; the server
// is reconciled in the background. Anonymous users live entirely locally and
// their tags/assignments are merged into the account on login.

export type EngineState = {
  schedule: Schedule | null;
  user: SessionUser | null;
  tags: Tag[];
  assignments: Map<string, LocalAssignment>;
  calendars: SavedCalendar[];
  online: boolean;
  syncing: boolean;
  pendingCount: number;
};

type Listener = () => void;

const LOCAL_TAG_PREFIX = "local-";
const LOCAL_CAL_PREFIX = "localcal-";

function now(): string {
  return new Date().toISOString();
}

// crypto.randomUUID only exists in secure contexts (https/localhost);
// getRandomValues works everywhere.
function uid(): string {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class SyncEngine {
  private state: EngineState = {
    schedule: null,
    user: null,
    tags: [],
    assignments: new Map(),
    calendars: [],
    online: true,
    syncing: false,
    pendingCount: 0,
  };
  private listeners = new Set<Listener>();
  private pushInFlight = false;
  private lastSyncAt = 0;
  private calIdMap = new Map<string, string>();

  getState = (): EngineState => {
    return this.state;
  };

  seedIfEmpty(snapshot: EngineState): void {
    if (!this.state.schedule) this.state = snapshot;
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  async boot(initial: {
    schedule: Schedule;
    user: SessionUser | null;
    tags: Tag[];
    assignments: TagAssignment[];
    calendars: SavedCalendar[];
  }): Promise<void> {
    this.set({ online: navigator.onLine });
    const revalidate = () => {
      if (!navigator.onLine || Date.now() - this.lastSyncAt < 15_000) return;
      void this.pushPending().then(() => this.refresh());
    };
    window.addEventListener("online", () => {
      this.set({ online: true });
      void this.pushPending().then(() => this.refresh());
    });
    window.addEventListener("offline", () => this.set({ online: false }));
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") revalidate();
    });
    setInterval(() => {
      if (document.visibilityState === "visible") revalidate();
    }, 5 * 60_000);

    const cachedUser = await kvGet<SessionUser | null>("user");
    const serverReachable = initial.tags.length > 0 || initial.schedule.concerts.length > 0;

    if (serverReachable) {
      await kvSet("schedule", initial.schedule);
      await kvSet("user", initial.user);
      if (initial.user && initial.user.id !== cachedUser?.id) {
        // Fresh login (e.g. OAuth redirect landed server-side): merge local state up.
        await this.mergeLocalIntoAccount(initial.user);
      }
      await this.reconcileTags(initial.tags, initial.user);
      await this.reconcileAssignments(initial.assignments);
      await this.reconcileCalendars(initial.calendars);
    }

    const schedule =
      (await kvGet<Schedule>("schedule")) ?? initial.schedule;
    const user = (await kvGet<SessionUser | null>("user")) ?? initial.user;
    const tags = await db.tags.toArray();
    const assignments = new Map(
      (await db.assignments.toArray()).map((a) => [a.key, a])
    );
    const calendars = await db.calendars.toArray();
    const pendingCount = await db.assignments.where("dirty").equals(1).count();
    this.set({
      schedule,
      user,
      tags: sortTags(tags, user),
      assignments,
      calendars: sortCalendars(calendars),
      pendingCount,
    });

    if (navigator.onLine && user) void this.pushPending();
  }

  async refresh(): Promise<void> {
    if (!navigator.onLine) return;
    this.set({ syncing: true });
    this.lastSyncAt = Date.now();
    try {
      const [schedule, { tags }] = await Promise.all([api.schedule(), api.tags()]);
      await kvSet("schedule", schedule);
      await this.reconcileTags(tags, this.state.user);
      if (this.state.user) {
        const [{ assignments }, { calendars }] = await Promise.all([
          api.assignments(),
          api.calendars(),
        ]);
        await this.reconcileAssignments(assignments);
        await this.reconcileCalendars(calendars);
      }
      await this.reload();
    } catch {
      // Stay on cached data; next online event retries.
    } finally {
      this.set({ syncing: false });
    }
  }

  private async reload(): Promise<void> {
    const tags = await db.tags.toArray();
    const assignments = new Map(
      (await db.assignments.toArray()).map((a) => [a.key, a])
    );
    const calendars = await db.calendars.toArray();
    const schedule = (await kvGet<Schedule>("schedule")) ?? this.state.schedule;
    const pendingCount = await db.assignments.where("dirty").equals(1).count();
    this.set({
      schedule,
      tags: sortTags(tags, this.state.user),
      assignments,
      calendars: sortCalendars(calendars),
      pendingCount,
    });
  }

  private async reconcileCalendars(server: SavedCalendar[]): Promise<void> {
    const localOnly = (await db.calendars.toArray()).filter((c) =>
      c.id.startsWith(LOCAL_CAL_PREFIX)
    );
    await db.calendars.clear();
    await db.calendars.bulkPut([...server, ...localOnly]);
  }

  // Server tag list wins for non-dirty data, but locally created (not yet
  // pushed) tags must survive the overwrite.
  private async reconcileTags(serverTags: Tag[], user: SessionUser | null): Promise<void> {
    const localOnly = (await db.tags.toArray()).filter((t) =>
      t.id.startsWith(LOCAL_TAG_PREFIX)
    );
    await db.tags.clear();
    await db.tags.bulkPut([...serverTags, ...localOnly]);
    void user;
  }

  private async reconcileAssignments(server: TagAssignment[]): Promise<void> {
    await db.transaction("rw", db.assignments, async () => {
      for (const a of server) {
        const key = asgKey(a.concertId, a.tagId);
        const local = await db.assignments.get(key);
        if (local?.dirty && local.clientUpdatedAt > a.clientUpdatedAt) continue;
        await db.assignments.put({ key, ...a, dirty: 0 });
      }
    });
  }

  async toggleTag(concertId: string, tagId: string): Promise<void> {
    const current = this.state.assignments.get(asgKey(concertId, tagId));
    await this.setAssignment(concertId, tagId, !(current?.active ?? false));
  }

  async setAssignment(concertId: string, tagId: string, active: boolean): Promise<void> {
    const key = asgKey(concertId, tagId);
    const next: LocalAssignment = {
      key,
      concertId,
      tagId,
      active,
      clientUpdatedAt: now(),
      dirty: 1,
    };
    await db.assignments.put(next);
    const assignments = new Map(this.state.assignments);
    assignments.set(key, next);
    this.set({ assignments, pendingCount: this.state.pendingCount + 1 });
    if (this.state.user && this.state.online) void this.pushPending();
  }

  async createTag(name: string, color: string): Promise<Tag> {
    if (this.state.user && this.state.online) {
      try {
        const { tag } = await api.createTag(name, color);
        await db.tags.put(tag);
        await this.reload();
        return tag;
      } catch (e) {
        if (e instanceof ApiError && e.status !== 429 && e.status < 500) throw e;
        // Network/server hiccup: fall through to the offline path.
      }
    }
    const localId = `${LOCAL_TAG_PREFIX}${uid()}`;
    const tag: Tag = {
      id: localId,
      name,
      slug: slugifyTag(name),
      color,
      ownerId: this.state.user?.id ?? "anonymous",
    };
    await db.tags.put(tag);
    if (this.state.user) {
      await db.tagOps.add({ op: "create", localId, name, color } as never);
    }
    await this.reload();
    return tag;
  }

  async updateTag(id: string, data: { name?: string; color?: string }): Promise<void> {
    const tag = await db.tags.get(id);
    if (!tag) return;
    await db.tags.put({
      ...tag,
      ...data,
      slug: data.name
        ? data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : tag.slug,
    });
    if (!id.startsWith(LOCAL_TAG_PREFIX)) {
      if (this.state.user && this.state.online) {
        try {
          await api.updateTag(id, data);
        } catch {
          await db.tagOps.add({ op: "update", tagId: id, ...data } as never);
        }
      } else if (this.state.user) {
        await db.tagOps.add({ op: "update", tagId: id, ...data } as never);
      }
    }
    await this.reload();
  }

  async deleteTag(id: string): Promise<void> {
    await db.tags.delete(id);
    const stale = await db.assignments.where("tagId").equals(id).toArray();
    await db.assignments.bulkDelete(stale.map((s) => s.key));
    for (const cal of await db.calendars.toArray()) {
      if (cal.tagIds.includes(id)) {
        const tagIds = cal.tagIds.filter((t) => t !== id);
        if (tagIds.length === 0) await this.removeCalendar(cal.id);
        else await this.updateCalendarMeta(cal.id, { tagIds });
      }
    }
    if (id.startsWith(LOCAL_TAG_PREFIX)) {
      // Cancel a pending create instead of queueing a delete.
      const ops = await db.tagOps.toArray();
      const pending = ops.find((o) => o.op === "create" && o.localId === id);
      if (pending) await db.tagOps.delete(pending.id);
    } else if (this.state.user) {
      if (this.state.online) {
        try {
          await api.deleteTag(id);
        } catch {
          await db.tagOps.add({ op: "delete", tagId: id } as never);
        }
      } else {
        await db.tagOps.add({ op: "delete", tagId: id } as never);
      }
    }
    await this.reload();
  }

  async saveCalendar(name: string, tagIds: string[]): Promise<SavedCalendar> {
    if (this.state.user && this.state.online && tagIds.every((t) => !t.startsWith(LOCAL_TAG_PREFIX))) {
      try {
        const { calendar } = await api.createCalendar(name, tagIds);
        await db.calendars.put(calendar);
        await this.reload();
        return calendar;
      } catch (e) {
        if (e instanceof ApiError && e.status !== 429 && e.status < 500) throw e;
      }
    }
    const localId = `${LOCAL_CAL_PREFIX}${uid()}`;
    const calendar: SavedCalendar = {
      id: localId,
      ownerId: this.state.user?.id ?? "anonymous",
      name,
      tagIds,
      shareToken: null,
      shareEnabled: false,
      isDefault: false,
    };
    await db.calendars.put(calendar);
    if (this.state.user) {
      await db.calOps.add({ op: "create", localId, name, tagIds } as never);
    }
    await this.reload();
    return calendar;
  }

  // One default per user: turning it on clears the flag everywhere else.
  async setDefaultCalendar(id: string, on: boolean): Promise<void> {
    for (const cal of await db.calendars.toArray()) {
      const next = cal.id === id ? on : false;
      if (cal.isDefault !== next) await db.calendars.put({ ...cal, isDefault: next });
    }
    if (!id.startsWith(LOCAL_CAL_PREFIX) && this.state.user) {
      if (this.state.online) {
        try {
          await api.updateCalendar(id, { isDefault: on });
        } catch {
          await db.calOps.add({ op: "update", calendarId: id, isDefault: on } as never);
        }
      } else {
        await db.calOps.add({ op: "update", calendarId: id, isDefault: on } as never);
      }
    }
    await this.reload();
  }

  async updateCalendarMeta(
    id: string,
    data: { name?: string; tagIds?: string[] }
  ): Promise<void> {
    const cal = await db.calendars.get(id);
    if (!cal) return;
    await db.calendars.put({ ...cal, ...data });
    if (id.startsWith(LOCAL_CAL_PREFIX)) {
      const ops = await db.calOps.toArray();
      const pending = ops.find((o) => o.op === "create" && o.localId === id);
      if (pending) {
        await db.calOps.put({
          ...pending,
          name: data.name ?? pending.name,
          tagIds: data.tagIds ?? pending.tagIds,
        });
      }
    } else if (this.state.user) {
      if (this.state.online) {
        try {
          await api.updateCalendar(id, data);
        } catch {
          await db.calOps.add({ op: "update", calendarId: id, ...data } as never);
        }
      } else {
        await db.calOps.add({ op: "update", calendarId: id, ...data } as never);
      }
    }
    await this.reload();
  }

  async removeCalendar(id: string): Promise<void> {
    await db.calendars.delete(id);
    if (id.startsWith(LOCAL_CAL_PREFIX)) {
      const ops = await db.calOps.toArray();
      const pending = ops.find((o) => o.op === "create" && o.localId === id);
      if (pending) await db.calOps.delete(pending.id);
    } else if (this.state.user) {
      if (this.state.online) {
        try {
          await api.deleteCalendar(id);
        } catch {
          await db.calOps.add({ op: "delete", calendarId: id } as never);
        }
      } else {
        await db.calOps.add({ op: "delete", calendarId: id } as never);
      }
    }
    await this.reload();
  }

  // Sharing needs the server to answer the link. Signed-in calendars get a
  // live link; anonymous ones upload a frozen snapshot revocable only from
  // this device (the secret never leaves it).
  async setCalendarSharing(id: string, enabled: boolean): Promise<string | null> {
    if (!this.state.online) throw new ApiError(0, "Sharing needs a connection");
    if (!this.state.user) return this.setAnonymousSharing(id, enabled);
    if (id.startsWith(LOCAL_CAL_PREFIX)) {
      await this.pushPending();
      const serverId = this.calIdMap.get(id);
      if (!serverId) throw new ApiError(0, "Calendar not synced yet, retry in a moment");
      id = serverId;
    }
    const { calendar, url } = await api.shareCalendar(id, enabled);
    await db.calendars.put(calendar);
    await this.reload();
    return url;
  }

  private async setAnonymousSharing(id: string, enabled: boolean): Promise<string | null> {
    const cal = this.state.calendars.find((c) => c.id === id);
    if (!cal) throw new ApiError(404, "Calendar not found");
    const kvKey = `share:${id}`;
    if (!enabled) {
      const info = await kvGet<{ token: string; secret: string }>(kvKey);
      if (info) {
        await api.revokeSnapshotShare(info.token, info.secret).catch(() => undefined);
        await kvSet(kvKey, null);
      }
      await db.calendars.put({ ...cal, shareToken: null, shareEnabled: false });
      await this.reload();
      return null;
    }
    const tagSet = new Set(cal.tagIds);
    const byId = new Map(this.state.tags.map((t) => [t.id, t]));
    const tags = cal.tagIds
      .map((tid) => byId.get(tid))
      .filter((t): t is Tag => !!t)
      .map((t) => ({
        slug: t.slug,
        name: t.name,
        color: t.color,
        global: t.ownerId === GLOBAL_OWNER,
      }));
    const assignments = [...this.state.assignments.values()]
      .filter((a) => a.active && tagSet.has(a.tagId))
      .map((a) => ({ concertId: a.concertId, tagSlug: byId.get(a.tagId)!.slug }));
    const { token, secret, url } = await api.createSnapshotShare({
      calendarName: cal.name,
      ownerName: "A fellow metalhead",
      tags,
      assignments,
    });
    await kvSet(kvKey, { token, secret });
    await db.calendars.put({ ...cal, shareToken: token, shareEnabled: true });
    await this.reload();
    return url;
  }

  // Rebuild a shared calendar in this account/device: global tags map by slug,
  // user tags are cloned (reusing an existing own tag with the same slug).
  async importSnapshot(
    snapshot: CalendarSnapshot,
    personalName: string
  ): Promise<{ tagIds: string[] }> {
    const tagIdBySlug = new Map<string, string>();
    for (const t of snapshot.tags) {
      const existing = this.state.tags.find(
        (x) => x.slug === t.slug && (t.global ? x.ownerId === GLOBAL_OWNER : x.ownerId !== GLOBAL_OWNER)
      );
      if (existing) {
        tagIdBySlug.set(t.slug, existing.id);
        continue;
      }
      const created = await this.createTag(t.name, t.color);
      tagIdBySlug.set(t.slug, created.id);
    }
    for (const a of snapshot.assignments) {
      const tagId = tagIdBySlug.get(a.tagSlug);
      if (!tagId) continue;
      const key = asgKey(a.concertId, tagId);
      if (this.state.assignments.get(key)?.active) continue;
      await this.setAssignment(a.concertId, tagId, true);
    }
    const tagIds = [...new Set(tagIdBySlug.values())];
    await this.saveCalendar(personalName, tagIds);
    return { tagIds };
  }

  async pushPending(): Promise<void> {
    if (this.pushInFlight || !this.state.user || !navigator.onLine) return;
    this.pushInFlight = true;
    this.set({ syncing: true });
    try {
      await this.replayTagOps();
      await this.replayCalOps();
      const dirty = await db.assignments.where("dirty").equals(1).toArray();
      const pushable = dirty.filter((d) => !d.tagId.startsWith(LOCAL_TAG_PREFIX));
      if (pushable.length > 0) {
        const { assignments } = await api.pushAssignments(
          pushable.map(({ concertId, tagId, active, clientUpdatedAt }) => ({
            concertId,
            tagId,
            active,
            clientUpdatedAt,
          }))
        );
        await this.reconcileAssignments(assignments);
        await db.transaction("rw", db.assignments, async () => {
          for (const p of pushable) {
            const row = await db.assignments.get(p.key);
            if (row && row.clientUpdatedAt === p.clientUpdatedAt) {
              await db.assignments.put({ ...row, dirty: 0 });
            }
          }
        });
      }
      await this.reload();
    } catch {
      // Retry on the next online event / toggle.
    } finally {
      this.pushInFlight = false;
      this.set({ syncing: false });
    }
  }

  private async replayTagOps(): Promise<void> {
    const ops = await db.tagOps.orderBy("id").toArray();
    for (const op of ops) {
      if (op.op === "create") {
        const { tag } = await api.createTag(op.name, op.color);
        await db.tags.delete(op.localId);
        await db.tags.put(tag);
        const stale = await db.assignments.where("tagId").equals(op.localId).toArray();
        for (const s of stale) {
          await db.assignments.delete(s.key);
          await db.assignments.put({
            ...s,
            tagId: tag.id,
            key: asgKey(s.concertId, tag.id),
          });
        }
        // Calendars (saved rows and queued creates) may reference the local id.
        const remap = (ids: string[]) => ids.map((i) => (i === op.localId ? tag.id : i));
        for (const cal of await db.calendars.toArray()) {
          if (cal.tagIds.includes(op.localId)) {
            await db.calendars.put({ ...cal, tagIds: remap(cal.tagIds) });
          }
        }
        for (const cop of await db.calOps.toArray()) {
          if (cop.op === "delete" || !cop.tagIds?.includes(op.localId)) continue;
          await db.calOps.put({ ...cop, tagIds: remap(cop.tagIds) });
        }
      } else if (op.op === "update") {
        await api.updateTag(op.tagId, { name: op.name, color: op.color });
      } else {
        try {
          await api.deleteTag(op.tagId);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e;
        }
      }
      await db.tagOps.delete(op.id);
    }
  }

  private async replayCalOps(): Promise<void> {
    const ops = await db.calOps.orderBy("id").toArray();
    for (const op of ops) {
      if (op.op === "create") {
        if (op.tagIds!.some((t) => t.startsWith(LOCAL_TAG_PREFIX))) {
          // Referenced tag still unsynced (its create must have failed); retry later.
          continue;
        }
        const wasDefault = (await db.calendars.get(op.localId!))?.isDefault ?? false;
        let { calendar } = await api.createCalendar(op.name!, op.tagIds!);
        if (wasDefault) {
          ({ calendar } = await api.updateCalendar(calendar.id, { isDefault: true }));
        }
        await db.calendars.delete(op.localId!);
        await db.calendars.put(calendar);
        this.calIdMap.set(op.localId!, calendar.id);
      } else if (op.op === "update") {
        await api.updateCalendar(op.calendarId!, {
          name: op.name,
          tagIds: op.tagIds,
          isDefault: op.isDefault,
        });
      } else {
        try {
          await api.deleteCalendar(op.calendarId!);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e;
        }
      }
      await db.calOps.delete(op.id);
    }
  }

  // Anonymous → account: everything local becomes dirty and is pushed up.
  private async mergeLocalIntoAccount(user: SessionUser): Promise<void> {
    const locals = await db.tags.toArray();
    for (const t of locals.filter((t) => t.ownerId === "anonymous")) {
      await db.tags.put({ ...t, ownerId: user.id });
      if (t.id.startsWith(LOCAL_TAG_PREFIX)) {
        const ops = await db.tagOps.toArray();
        const queued = ops.some((o) => o.op === "create" && o.localId === t.id);
        if (!queued) {
          await db.tagOps.add({ op: "create", localId: t.id, name: t.name, color: t.color } as never);
        }
      }
    }
    const all = await db.assignments.toArray();
    await db.assignments.bulkPut(all.map((a) => ({ ...a, dirty: 1 as const })));

    for (const cal of await db.calendars.toArray()) {
      if (cal.ownerId !== "anonymous") continue;
      await db.calendars.put({ ...cal, ownerId: user.id });
      if (cal.id.startsWith(LOCAL_CAL_PREFIX)) {
        const ops = await db.calOps.toArray();
        const queued = ops.some((o) => o.op === "create" && o.localId === cal.id);
        if (!queued) {
          await db.calOps.add({
            op: "create",
            localId: cal.id,
            name: cal.name,
            tagIds: cal.tagIds,
          } as never);
        }
      }
    }
  }

  async login(email: string, password: string): Promise<void> {
    await api.login(email, password);
    await this.afterAuth();
  }

  async register(name: string, email: string, password: string): Promise<void> {
    await api.register(name, email, password);
    await this.afterAuth();
  }

  private async afterAuth(): Promise<void> {
    const { user } = await api.me();
    if (!user) throw new ApiError(500, "Session not established");
    await kvSet("user", user);
    this.set({ user });
    await this.mergeLocalIntoAccount(user);
    await this.pushPending();
    await this.refresh();
  }

  async logout(): Promise<void> {
    await api.logout().catch(() => undefined);
    // Personal data leaves the device with the account.
    await db.assignments.clear();
    await db.tagOps.clear();
    await db.calendars.clear();
    await db.calOps.clear();
    await db.tags.filter((t) => t.ownerId !== "_global").delete();
    await kvSet("user", null);
    await this.reload();
    this.set({ user: null });
  }
}

function sortCalendars(cals: SavedCalendar[]): SavedCalendar[] {
  return [...cals].sort((a, b) => a.name.localeCompare(b.name));
}

function sortTags(tags: Tag[], user: SessionUser | null): Tag[] {
  void user;
  return [...tags].sort((a, b) => {
    const ga = a.ownerId === "_global" ? 0 : 1;
    const gb = b.ownerId === "_global" ? 0 : 1;
    return ga !== gb ? ga - gb : a.name.localeCompare(b.name);
  });
}

export const engine = new SyncEngine();
