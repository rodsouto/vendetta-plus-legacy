// Minimal hash router: "#/missions?to=1:1:5&kind=1". An empty path is the app's landing page.
import { useSyncExternalStore } from "react";

const read = () => {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = raw.split("?");
  return { path, params: new URLSearchParams(query) };
};

let current = read();
const listeners = new Set<() => void>();
window.addEventListener("hashchange", () => {
  current = read();
  listeners.forEach((l) => l());
});

export function useRoute() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export const go = (to: string) => {
  location.hash = `/${to}`;
};
