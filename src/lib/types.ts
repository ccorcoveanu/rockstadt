export type Stage = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

export type Concert = {
  id: string;
  band: string;
  stageId: string;
  day: number;
  date: string;
  startsAt: string;
  endsAt: string;
  openEnded: boolean;
};

export const GLOBAL_OWNER = "_global";

export type Tag = {
  id: string;
  name: string;
  slug: string;
  color: string;
  ownerId: string;
};

export type TagAssignment = {
  concertId: string;
  tagId: string;
  active: boolean;
  clientUpdatedAt: string;
};

export type SavedCalendar = {
  id: string;
  ownerId: string;
  name: string;
  tagIds: string[];
  shareToken: string | null;
  shareEnabled: boolean;
  isDefault: boolean;
};

// What a share link resolves to: enough to rebuild the calendar in another
// account. Global tags are referenced by slug (mapped to the same global tag
// on import); user tags are cloned.
export type CalendarSnapshot = {
  calendarName: string;
  ownerName: string;
  tags: { slug: string; name: string; color: string; global: boolean }[];
  assignments: { concertId: string; tagSlug: string }[];
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

export type Schedule = {
  festival: {
    name: string;
    edition: string;
    location: string;
    timezone: string;
  };
  stages: Stage[];
  concerts: Concert[];
};

export function isGlobalTag(tag: Pick<Tag, "ownerId">): boolean {
  return tag.ownerId === GLOBAL_OWNER;
}

export function slugifyTag(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
