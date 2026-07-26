"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
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
