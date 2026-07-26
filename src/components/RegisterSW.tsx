"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // A prod SW left over on this origin would serve stale caches under the
      // dev server — evict it entirely.
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) void r.unregister();
      });
      void caches.keys().then((keys) => {
        for (const k of keys) if (k.startsWith("ref-")) void caches.delete(k);
      });
      return;
    }
    // A new deploy installs a new SW (stamped version); when it replaces a
    // previous controller, reload once so the page runs the fresh bundle.
    // First-ever install (no prior controller) must NOT reload.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !reloaded) {
        reloaded = true;
        window.location.reload();
      }
    });
    void navigator.serviceWorker.register("/sw.js").then((reg) => {
      void reg.update();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void reg.update();
      });
    });
  }, []);
  return null;
}
