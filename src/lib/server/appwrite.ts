import { Account, Client, Storage, TablesDB, Teams, Users } from "node-appwrite";
import { env } from "./env";

export function adminClient() {
  const client = new Client()
    .setEndpoint(env.endpoint)
    .setProject(env.projectId)
    .setKey(env.apiKey);
  return {
    client,
    account: new Account(client),
    tables: new TablesDB(client),
    teams: new Teams(client),
    users: new Users(client),
    storage: new Storage(client),
  };
}

export function sessionClient(sessionSecret: string) {
  const client = new Client()
    .setEndpoint(env.endpoint)
    .setProject(env.projectId)
    .setSession(sessionSecret);
  return {
    client,
    account: new Account(client),
  };
}

export const TABLES = {
  stages: "stages",
  concerts: "concerts",
  tags: "tags",
  assignments: "tag_assignments",
  calendars: "calendars",
} as const;

export const ADMIN_TEAM_ID = "admins";
