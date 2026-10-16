// The binding: spine (title, language, account), the open page, the thumb index.
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GameProvider, useNetwork, useGame } from "./state/game.js";
import { makeClients } from "./chain/config.js";
import { useRoute } from "./router.js";
import { Toasts } from "./ui/parts.js";
import { Book } from "./pages/Book.js";
import { MapPage } from "./pages/MapPage.js";
import { Missions } from "./pages/Missions.js";
import { Reports } from "./pages/Reports.js";
import { Family } from "./pages/Family.js";
import { Market } from "./pages/Market.js";
import { Account } from "./pages/Account.js";
import { Ranking } from "./pages/Ranking.js";
import { Dev } from "./pages/Dev.js";
import { useMemo, useState } from "react";
import { applyTheme, storedTheme, type Theme } from "./theme.js";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

const PAGES = [
  ["book", "L", Book],
  ["map", "P", MapPage],
  ["missions", "M", Missions],
  ["reports", "I", Reports],
  ["family", "F", Family],
  ["market", "C", Market],
  ["account", "A", Account],
  ["ranking", "R", Ranking],
  ["dev", "T", Dev],
] as const;

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Connected />
    </QueryClientProvider>
  );
}

function Connected() {
  const { t } = useTranslation();
  const query = useNetwork();
  const network = typeof query.data === "object" ? query.data : null;
  const clients = useMemo(
    () => (network ? makeClients(network.deployment, network.chain) : null),
    [network],
  );
  if (query.isLoading) return <Shell>{<p className="empty">{t("common.loading")}</p>}</Shell>;
  if (!network || !clients)
    return (
      <Shell>
        <header className="account-head">
          <h2>{t("connect.title")}</h2>
        </header>
        <p className="note">
          {t(`connect.${typeof query.data === "string" ? query.data : "noLocal"}`)}
        </p>
      </Shell>
    );
  return (
    <GameProvider clients={clients} network={network}>
      {(ready) =>
        ready ? (
          <Game />
        ) : (
          <Shell>
            <p className="empty">{t("common.loading")}</p>
          </Shell>
        )
      }
    </GameProvider>
  );
}

function Spine({ children }: { children?: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<Theme>(storedTheme);
  return (
    <header className="spine">
      <h1>{t("title")}</h1>
      <div className="who">
        {children}
        <select
          aria-label={t("theme.label")}
          value={theme}
          onChange={(e) => {
            const next = e.target.value as Theme;
            setTheme(next);
            applyTheme(next);
          }}
        >
          <option value="auto">{t("theme.auto")}</option>
          <option value="light">{t("theme.light")}</option>
          <option value="dark">{t("theme.dark")}</option>
        </select>
        <select
          aria-label="Idioma / Language"
          value={i18n.language.slice(0, 2)}
          onChange={(e) => void i18n.changeLanguage(e.target.value)}
        >
          <option value="es">ES</option>
          <option value="en">EN</option>
        </select>
      </div>
    </header>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="binding">
      <Spine />
      <main className="page">{children}</main>
    </div>
  );
}

function Game() {
  const { t } = useTranslation();
  const g = useGame();
  const { path } = useRoute();
  // The workshop drives anvil (time travel, the deployer's admin key): local only, never on
  // Arbitrum One. With passkeys (`pnpm dev:aa`) it shows too, without the account switcher.
  const pages = PAGES.filter(([id]) => id !== "dev" || g.network.id === "local");
  const page = pages.find(([id]) => id === path) ?? pages[0]!;
  const Page = page[2];
  const signedOut = g.signer.mode === "passkey" && !g.address;
  return (
    <div className="binding">
      <Spine>
        {signedOut ? (
          <button className="btn quiet" disabled={g.busy} onClick={() => void g.signIn()}>
            {t("entry.signIn")}
          </button>
        ) : (
          <span>{g.me ? `#${g.me.id}` : "—"}</span>
        )}
      </Spine>
      <main className="page" id="page">
        <Page key={`${path}-${g.address ?? ""}`} />
      </main>
      <nav className="thumb-index" aria-label="Índice">
        {pages.map(([id, letter]) => (
          <a key={id} href={`#/${id}`} aria-current={page[0] === id ? "page" : undefined}>
            <span className="letter" aria-hidden="true">
              {letter}
            </span>
            {t(`nav.${id}`)}
          </a>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
