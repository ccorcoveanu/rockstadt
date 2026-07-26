import { cookies } from "next/headers";
import type { Models } from "node-appwrite";
import { ADMIN_TEAM_ID, adminClient, sessionClient } from "./appwrite";
import type { SessionUser } from "../types";

export const SESSION_COOKIE = "ref_session";

export async function setSessionCookie(secret: string, expire: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expire),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionSecret(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

async function isAdmin(userId: string): Promise<boolean> {
  const { users } = adminClient();
  try {
    const { memberships } = await users.listMemberships({ userId });
    return memberships.some((m) => m.teamId === ADMIN_TEAM_ID && m.confirm);
  } catch {
    return false;
  }
}

export async function getUser(): Promise<SessionUser | null> {
  const secret = await getSessionSecret();
  if (!secret) return null;
  let account: Models.User<Models.Preferences>;
  try {
    account = await sessionClient(secret).account.get();
  } catch {
    return null;
  }
  return {
    id: account.$id,
    name: account.name,
    email: account.email,
    isAdmin: await isAdmin(account.$id),
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new AuthError(401, "Not authenticated");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new AuthError(403, "Admin only");
  return user;
}

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
