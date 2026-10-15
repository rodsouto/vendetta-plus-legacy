// Day / night: "auto" follows the system (prefers-color-scheme); "light" and "dark" force it via
// data-theme on <html>, which styles.css honors. The choice is remembered per browser.
export type Theme = "auto" | "light" | "dark";

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem("theme");
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  const night =
    theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.style.colorScheme = night ? "dark" : "light";
  try {
    if (theme === "auto") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    /* private mode */
  }
}
