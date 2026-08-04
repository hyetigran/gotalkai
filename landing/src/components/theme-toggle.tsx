"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "lingoai-theme";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return document.documentElement.dataset.theme === "dark";
}

/** Matches `layout.tsx`'s server-rendered `<html>` — no `data-theme` attribute, since the server has no access to localStorage/matchMedia. */
function getServerSnapshot() {
  return false;
}

function setTheme(dark: boolean) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    window.localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  } catch {
    // Private browsing / storage disabled — theme just won't persist across visits.
  }
  for (const listener of listeners) listener();
}

function SunIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" />
    </svg>
  );
}

/**
 * `useSyncExternalStore`, not `useState` + a mount effect — `data-theme`
 * is state React doesn't own (`layout.tsx`'s inline anti-flash script
 * sets it on `<html>` before React even hydrates), and this is the API
 * React ships specifically for reading external state like that without
 * a hydration mismatch: `getServerSnapshot` matches what the server
 * rendered (always light), `getSnapshot` reads the real DOM value on the
 * client, and React reconciles the two safely on its own — no
 * setState-in-an-effect correction render to hand-roll.
 */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => setTheme(!dark)}
      title={dark ? "Switch to light" : "Switch to dark"}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex size-[38px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-card text-nav transition-colors hover:border-accent"
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
