import type { Schedule, SessionUser, Tag, TagAssignment } from "../types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }
  return body as T;
}

export const api = {
  schedule: () => request<Schedule>("/api/schedule"),
  me: () => request<{ user: SessionUser | null }>("/api/auth/me"),
  login: (email: string, password: string) =>
    request<{ ok: true }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    request<{ ok: true }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  tags: () => request<{ tags: Tag[] }>("/api/tags"),
  createTag: (name: string, color: string) =>
    request<{ tag: Tag }>("/api/tags", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  updateTag: (id: string, data: { name?: string; color?: string }) =>
    request<{ tag: Tag }>(`/api/tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteTag: (id: string) =>
    request<{ ok: true }>(`/api/tags/${id}`, { method: "DELETE" }),
  assignments: () => request<{ assignments: TagAssignment[] }>("/api/assignments"),
  pushAssignments: (assignments: TagAssignment[]) =>
    request<{ assignments: TagAssignment[] }>("/api/assignments", {
      method: "POST",
      body: JSON.stringify({ assignments }),
    }),
  adminCreateGlobalTag: (name: string, color: string) =>
    request<{ tag: Tag }>("/api/admin/tags", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  adminUpdateGlobalTag: (id: string, data: { name?: string; color?: string }) =>
    request<{ tag: Tag }>(`/api/admin/tags/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  adminDeleteGlobalTag: (id: string) =>
    request<{ ok: true }>(`/api/admin/tags/${id}`, { method: "DELETE" }),
  adminCreateConcert: (data: Record<string, unknown>) =>
    request<{ concert: unknown }>("/api/admin/concerts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  adminUpdateConcert: (id: string, data: Record<string, unknown>) =>
    request<{ concert: unknown }>(`/api/admin/concerts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  adminDeleteConcert: (id: string) =>
    request<{ ok: true }>(`/api/admin/concerts/${id}`, { method: "DELETE" }),
};
