"use client";
import { useEffect, type RefObject } from "react";

/** Contain keyboard focus and restore it to the opener when an overlay closes. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
    )).filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
    const first = dialog.querySelector<HTMLElement>('input[role="combobox"]') || focusable()[0];
    first?.focus();
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, ref]);
}
