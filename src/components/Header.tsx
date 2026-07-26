"use client";

import Link from "next/link";
import { useState } from "react";
import { useFestival } from "./Provider";
import { AuthDialog } from "./AuthDialog";

export function Header() {
  const { state, engine } = useFestival();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const syncDot = !state.online
    ? { color: "bg-clash", label: "Offline — changes saved on device" }
    : state.syncing || state.pendingCount > 0
      ? { color: "bg-gold", label: `Syncing${state.pendingCount ? ` · ${state.pendingCount} pending` : ""}` }
      : { color: "bg-[var(--stage-green)]", label: "Synced" };

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="font-display text-xl leading-none tracking-wide">
          ROCK<span className="text-[var(--stage-magenta)]">STADT</span>
          <span className="ml-2 hidden text-xs text-muted sm:inline font-cond font-semibold tracking-[0.2em]">
            EXTREME FEST · PLANNER
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <span
            title={syncDot.label}
            className="flex items-center gap-1.5 font-cond text-xs uppercase tracking-wider text-muted"
          >
            <span className={`h-2 w-2 rounded-full ${syncDot.color}`} />
            <span className="hidden sm:inline">
              {!state.online ? "offline" : state.syncing ? "syncing" : "synced"}
            </span>
          </span>

          {state.user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="rough-bg-sm [--block-bg:var(--bg-raised)] px-3 py-1.5 font-cond text-sm font-semibold uppercase tracking-wider hover:opacity-90"
              >
                {state.user.name || state.user.email}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-11 z-50 w-44 border border-white/10 bg-bg-raised p-1 shadow-2xl">
                  {state.user.isAdmin && (
                    <Link
                      href="/admin"
                      className="block px-3 py-2 font-cond text-sm uppercase tracking-wider hover:bg-white/5"
                      onClick={() => setMenuOpen(false)}
                    >
                      Admin
                    </Link>
                  )}
                  <button
                    className="block w-full px-3 py-2 text-left font-cond text-sm uppercase tracking-wider text-muted hover:bg-white/5"
                    onClick={() => {
                      setMenuOpen(false);
                      void engine.logout();
                    }}
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="rough-bg-sm [--block-bg:var(--stage-magenta)] px-3 py-1.5 font-cond text-sm font-bold uppercase tracking-wider text-white hover:brightness-110"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}
