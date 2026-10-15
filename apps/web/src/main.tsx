import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n/index.js";
import "./styles.css";
import { App } from "./App.js";
import { applyTheme, storedTheme } from "./theme.js";

applyTheme(storedTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
