import { createHash } from "node:crypto";
import { Query, type Models } from "node-appwrite";
import { adminClient, TABLES } from "./appwrite";
import { env } from "./env";
import {
  GLOBAL_OWNER,
  type Concert,
  type Schedule,
  type Stage,
  type Tag,
  type TagAssignment,
} from "../types";

type Row = Record<string, unknown> & { $id: string };

const MAX_PAGE = 500;

async function listAll(tableId: string, queries: string[] = []): Promise<Row[]> {
  const { tables } = adminClient();
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: { rows: Row[] } = (await tables.listRows({
      databaseId: env.databaseId,
      tableId,
      queries: [
        ...queries,
        Query.limit(MAX_PAGE),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    })) as { rows: Row[] };
    rows.push(...page.rows);
    if (page.rows.length < MAX_PAGE) return rows;
    cursor = page.rows[page.rows.length - 1].$id;
  }
}

function toStage(r: Row): Stage {
  return {
    id: r.$id,
    name: r.name as string,
    color: r.color as string,
    sortOrder: r.sortOrder as number,
  };
}

function toConcert(r: Row): Concert {
  return {
    id: r.$id,
    band: r.band as string,
    stageId: r.stageId as string,
    day: r.day as number,
    date: r.date as string,
    startsAt: r.startsAt as string,
    endsAt: r.endsAt as string,
    openEnded: Boolean(r.openEnded),
  };
}

function toTag(r: Row): Tag {
  return {
    id: r.$id,
    name: r.name as string,
    slug: r.slug as string,
    color: r.color as string,
    ownerId: r.ownerId as string,
  };
}

function toAssignment(r: Row): TagAssignment {
  return {
    concertId: r.concertId as string,
    tagId: r.tagId as string,
    active: Boolean(r.active),
    // Appwrite echoes "+00:00"; clients compare ISO strings, so normalize to "Z".
    clientUpdatedAt: new Date(r.clientUpdatedAt as string).toISOString(),
  };
}

export async function getSchedule(): Promise<Schedule> {
  const [stages, concerts] = await Promise.all([
    listAll(TABLES.stages),
    listAll(TABLES.concerts),
  ]);
  return {
    festival: {
      name: "Rockstadt Extreme Fest",
      edition: "12th Edition",
      location: "Ghimbav, Romania",
      timezone: "Europe/Bucharest",
    },
    stages: stages.map(toStage).sort((a, b) => a.sortOrder - b.sortOrder),
    concerts: concerts
      .map(toConcert)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  };
}

export async function listTagsFor(userId: string | null): Promise<Tag[]> {
  const owners = userId ? [GLOBAL_OWNER, userId] : [GLOBAL_OWNER];
  const rows = await listAll(TABLES.tags, [Query.equal("ownerId", owners)]);
  return rows.map(toTag);
}

export async function getTag(tagId: string): Promise<Tag | null> {
  const { tables } = adminClient();
  try {
    const r = (await tables.getRow({
      databaseId: env.databaseId,
      tableId: TABLES.tags,
      rowId: tagId,
    })) as Row;
    return toTag(r);
  } catch {
    return null;
  }
}

export async function createTag(tag: {
  name: string;
  slug: string;
  color: string;
  ownerId: string;
}): Promise<Tag> {
  const { tables } = adminClient();
  const { ID } = await import("node-appwrite");
  const r = (await tables.createRow({
    databaseId: env.databaseId,
    tableId: TABLES.tags,
    rowId: ID.unique(),
    data: tag,
  })) as Row;
  return toTag(r);
}

export async function updateTag(
  tagId: string,
  data: Partial<Pick<Tag, "name" | "slug" | "color">>
): Promise<Tag> {
  const { tables } = adminClient();
  const r = (await tables.updateRow({
    databaseId: env.databaseId,
    tableId: TABLES.tags,
    rowId: tagId,
    data,
  })) as Row;
  return toTag(r);
}

export async function deleteTag(tagId: string): Promise<void> {
  const { tables } = adminClient();
  await tables.deleteRow({
    databaseId: env.databaseId,
    tableId: TABLES.tags,
    rowId: tagId,
  });
  const orphans = await listAll(TABLES.assignments, [Query.equal("tagId", tagId)]);
  await Promise.all(
    orphans.map((o) =>
      tables.deleteRow({
        databaseId: env.databaseId,
        tableId: TABLES.assignments,
        rowId: o.$id,
      })
    )
  );
}

export async function listAssignments(userId: string): Promise<TagAssignment[]> {
  const rows = await listAll(TABLES.assignments, [Query.equal("userId", userId)]);
  return rows.map(toAssignment);
}

function assignmentRowId(userId: string, concertId: string, tagId: string): string {
  return createHash("sha256")
    .update(`${userId}|${concertId}|${tagId}`)
    .digest("hex")
    .slice(0, 36);
}

// Last-write-wins by clientUpdatedAt; returns the surviving state of each pushed key.
export async function upsertAssignments(
  userId: string,
  incoming: TagAssignment[]
): Promise<TagAssignment[]> {
  const { tables } = adminClient();
  const results: TagAssignment[] = [];
  for (const a of incoming) {
    const rowId = assignmentRowId(userId, a.concertId, a.tagId);
    let existing: Row | null = null;
    try {
      existing = (await tables.getRow({
        databaseId: env.databaseId,
        tableId: TABLES.assignments,
        rowId,
      })) as Row;
    } catch {
      existing = null;
    }
    if (
      existing &&
      new Date(existing.clientUpdatedAt as string).getTime() >=
        new Date(a.clientUpdatedAt).getTime()
    ) {
      results.push(toAssignment(existing));
      continue;
    }
    const r = (await tables.upsertRow<Models.DefaultRow>({
      databaseId: env.databaseId,
      tableId: TABLES.assignments,
      rowId,
      data: {
        userId,
        concertId: a.concertId,
        tagId: a.tagId,
        active: a.active,
        clientUpdatedAt: a.clientUpdatedAt,
      },
    })) as Row;
    results.push(toAssignment(r));
  }
  return results;
}

export async function createConcert(data: Omit<Concert, "id">): Promise<Concert> {
  const { tables } = adminClient();
  const { ID } = await import("node-appwrite");
  const r = (await tables.createRow({
    databaseId: env.databaseId,
    tableId: TABLES.concerts,
    rowId: ID.unique(),
    data,
  })) as Row;
  return toConcert(r);
}

export async function updateConcert(
  id: string,
  data: Partial<Omit<Concert, "id">>
): Promise<Concert> {
  const { tables } = adminClient();
  const r = (await tables.updateRow({
    databaseId: env.databaseId,
    tableId: TABLES.concerts,
    rowId: id,
    data,
  })) as Row;
  return toConcert(r);
}

export async function deleteConcert(id: string): Promise<void> {
  const { tables } = adminClient();
  await tables.deleteRow({
    databaseId: env.databaseId,
    tableId: TABLES.concerts,
    rowId: id,
  });
  const orphans = await listAll(TABLES.assignments, [Query.equal("concertId", id)]);
  await Promise.all(
    orphans.map((o) =>
      tables.deleteRow({
        databaseId: env.databaseId,
        tableId: TABLES.assignments,
        rowId: o.$id,
      })
    )
  );
}
