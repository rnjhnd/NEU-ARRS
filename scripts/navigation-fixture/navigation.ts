import { useSyncExternalStore } from "react";

export function navigate(path: string) {
  history.pushState(null, "", path);
  window.dispatchEvent(new Event("popstate"));
}
function subscribe(changed: () => void) {
  window.addEventListener("popstate", changed);
  return () => window.removeEventListener("popstate", changed);
}
export function usePathname() {
  return useSyncExternalStore(subscribe, () => location.pathname, () => "/");
}
const router = { push: navigate, replace: navigate, refresh: () => window.dispatchEvent(new Event("popstate")) };
export function useRouter() { return router; }
