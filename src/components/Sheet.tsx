"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";

// iOS-style modal container: bottom sheet with drag-to-dismiss on small
// screens, centered card on desktop. Content triggers dismissal through
// useSheetClose() so the exit animation always plays before unmount.

const CloseCtx = createContext<() => void>(() => {});

export function useSheetClose() {
  return useContext(CloseCtx);
}

const EXIT_MS = 240;

export function Sheet({
  onClose,
  children,
  labelledBy,
}: {
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragDelta = useRef(0);

  const requestClose = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    // Portal can only exist client-side; this one-shot flip after hydration
    // is the standard SSR-safe portal pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    // Timeout, not rAF: rAF never fires in hidden/background tabs, which
    // would leave the sheet permanently translated off-screen.
    const enter = window.setTimeout(() => setShown(true), 20);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(enter);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [requestClose]);

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (window.matchMedia("(min-width: 768px)").matches) return;
    const panel = panelRef.current;
    if (panel && panel.scrollTop > 0) return;
    dragStartY.current = e.touches[0].clientY;
    dragDelta.current = 0;
  }

  function onTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;
    const delta = Math.max(0, e.touches[0].clientY - dragStartY.current);
    dragDelta.current = delta;
    const panel = panelRef.current;
    if (panel) {
      panel.style.transition = "none";
      panel.style.transform = `translateY(${delta}px)`;
    }
  }

  function onTouchEnd() {
    if (dragStartY.current === null) return;
    const panel = panelRef.current;
    dragStartY.current = null;
    if (dragDelta.current > 110) {
      requestClose();
      return;
    }
    if (panel) {
      panel.style.transition = "";
      panel.style.transform = "";
    }
  }

  // No document during SSR — the sheet only exists client-side anyway.
  if (!mounted) return null;

  // Portal to <body>: ancestors with transforms/animations (e.g. .rise-in)
  // would otherwise become the containing block and break position: fixed.
  return createPortal(
    <div
      className={`sheet-backdrop ${shown && !leaving ? "is-open" : ""}`}
      onClick={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`sheet-panel ${shown && !leaving ? "is-open" : ""}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="sheet-handle md:hidden" aria-hidden />
        <CloseCtx.Provider value={requestClose}>{children}</CloseCtx.Provider>
      </div>
    </div>,
    document.body
  );
}

export function SheetTitle({
  id,
  children,
  onAction,
  actionLabel,
}: {
  id?: string;
  children: ReactNode;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const close = useSheetClose();
  return (
    <div className="mb-1 flex items-center justify-between gap-3">
      <h2 id={id} className="font-display text-2xl">
        {children}
      </h2>
      <button
        onClick={onAction ?? close}
        className="font-cond text-sm uppercase tracking-wider text-muted hover:text-ink"
      >
        {actionLabel ?? "Close ✕"}
      </button>
    </div>
  );
}
