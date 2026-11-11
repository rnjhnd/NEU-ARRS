"use client";

import { useSyncExternalStore } from "react";

const query = "(min-width: 1280px)"; // Matches Tailwind's xl navigation breakpoint.
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function getSnapshot() { return window.matchMedia(query).matches; }
function getServerSnapshot() { return false; }

export function useDesktopNavigation() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
