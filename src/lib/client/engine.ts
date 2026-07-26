import type { Schedule, SessionUser, Tag, TagAssignment } from "../types";
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
  online: boolean;
  syncing: boolean;
  pendingCount: number;
};

type Listener = () => void;

const LOCAL_TAG_PREFIX = "local-";

function now(): string {
  return new Date().toISOString();
}

export class SyncEngine {
  private state: EngineState = {
    schedule: null,
    user: null,
    tags: [],
    assignments: new Map(),
    online: true,
    syncing: false,
    pendingCount: 0,
  };
  private listeners = new Set<Listener>();
  private pushInFlight = false;

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
  }): Promise<void> {
    this.set({ online: navigator.onLine });
    window.addEventListener("online", () => {
      this.set({ online: true });
      void this.pushPending().then(() => this.refresh());
    });
    window.addEventListener("offline", () => this.set({ online: false }));

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
    }

    const schedule =
      (await kvGet<Schedule>("schedule")) ?? initial.schedule;
    const user = (await kvGet<SessionUser | null>("user")) ?? initial.user;
    const tags = await db.tags.toArray();
    const assignments = new Map(
      (await db.assignments.toArray()).map((a) => [a.key, a])
    );
    const pendingCount = await db.assignments.where("dirty").equals(1).count();
    this.set({ schedule, user, tags: sortTags(tags, user), assignments, pendingCount });

    if (navigator.onLine && user) void this.pushPending();
  }

  async refresh(): Promise<void> {
    if (!navigator.onLine) return;
    this.set({ syncing: true });
    try {
      const [schedule, { tags }] = await Promise.all([api.schedule(), api.tags()]);
      await kvSet("schedule", schedule);
      await this.reconcileTags(tags, this.state.user);
      if (this.state.user) {
        const { assignments } = await api.assignments();
        await this.reconcileAssignments(assignments);
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
    const schedule = (await kvGet<Schedule>("schedule")) ?? this.state.schedule;
    const pendingCount = await db.assignments.where("dirty").equals(1).count();
    this.set({
      schedule,
      tags: sortTags(tags, this.state.user),
      assignments,
      pendingCount,
    });
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
    const key = asgKey(concertId, tagId);
    const current = this.state.assignments.get(key);
    const next: LocalAssignment = {
      key,
      concertId,
      tagId,
      active: !(current?.active ?? false),
      clientUpdatedAt: now(),
      dirty: 1,
    };
    await db.assignments.put(next);
    const assignments = new Map(this.state.assignments);
    assignments.set(key, next);
    this.set({ assignments, pendingCount: this.state.pendingCount + 1 });
    if (this.state.user && this.state.online) void this.pushPending();
  }

  async createTag(name: string, color: string): Promise<void> {
    if (this.state.user && this.state.online) {
      try {
        const { tag } = await api.createTag(name, color);
        await db.tags.put(tag);
        await this.reload();
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status !== 429 && e.status < 500) throw e;
        // Network/server hiccup: fall through to the offline path.
      }
    }
    const localId = `${LOCAL_TAG_PREFIX}${crypto.randomUUID()}`;
    const tag: Tag = {
      id: localId,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      color,
      ownerId: this.state.user?.id ?? "anonymous",
    };
    await db.tags.put(tag);
    if (this.state.user) {
      await db.tagOps.add({ op: "create", localId, name, color } as never);
    }
    await this.reload();
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

  async pushPending(): Promise<void> {
    if (this.pushInFlight || !this.state.user || !navigator.onLine) return;
    this.pushInFlight = true;
    this.set({ syncing: true });
    try {
      await this.replayTagOps();
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
    await db.tags.filter((t) => t.ownerId !== "_global").delete();
    await kvSet("user", null);
    await this.reload();
    this.set({ user: null });
  }
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
