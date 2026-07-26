"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useFestival } from "./Provider";

export function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { engine } = useFestival();
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await engine.login(email, password);
      } else {
        await engine.register(String(fd.get("name")), email, password);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(92vw,26rem)] border border-white/10 bg-bg-raised p-0 text-ink"
    >
      <div className="p-6">
        <h2 className="font-display text-2xl">
          {mode === "login" ? "Welcome back" : "Join the pit"}
        </h2>
        <p className="mt-1 font-cond text-sm text-muted">
          Optional — everything works without an account. Sign in to sync your
          tags across devices.
        </p>

        <a
          href="/api/auth/oauth/google"
          className="rough-bg-sm [--block-bg:#fff] mt-5 block px-4 py-2.5 text-center font-cond font-bold uppercase tracking-wider text-black hover:opacity-90"
        >
          Continue with Google
        </a>

        <div className="my-5 flex items-center gap-3 text-muted">
          <div className="time-rule flex-1" />
          <span className="font-cond text-xs uppercase tracking-widest">or email</span>
          <div className="time-rule flex-1" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <input
              name="name"
              required
              placeholder="Name"
              className="w-full border border-white/10 bg-black/30 px-3 py-2.5 outline-none placeholder:text-muted focus:border-[var(--stage-magenta)]"
            />
          )}
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="w-full border border-white/10 bg-black/30 px-3 py-2.5 outline-none placeholder:text-muted focus:border-[var(--stage-magenta)]"
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="Password (8+ characters)"
            className="w-full border border-white/10 bg-black/30 px-3 py-2.5 outline-none placeholder:text-muted focus:border-[var(--stage-magenta)]"
          />
          {error && <p className="text-sm text-clash">{error}</p>}
          <button
            disabled={busy}
            className="rough-bg-sm [--block-bg:var(--stage-magenta)] w-full px-4 py-2.5 font-cond font-bold uppercase tracking-wider text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode((m) => (m === "login" ? "register" : "login"));
            setError(null);
          }}
          className="mt-4 font-cond text-sm uppercase tracking-wider text-muted hover:text-ink"
        >
          {mode === "login" ? "No account? Register" : "Have an account? Sign in"}
        </button>
      </div>
    </dialog>
  );
}
