// The binding: spine (title, building, language, account), the open page, the thumb index.
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GameProvider, useNetwork, useGame } from "./state/game.js";
import { makeClients } from "./chain/config.js";
import { useRoute } from "./router.js";
import { Toasts } from "./ui/parts.js";
import { GameGuide } from "./ui/Guide.js";
import { Overview } from "./pages/Overview.js";
import { Book } from "./pages/Book.js";
import { MapPage } from "./pages/MapPage.js";
import { Missions } from "./pages/Missions.js";
import { Reports } from "./pages/Reports.js";
import { Family } from "./pages/Family.js";
import { Market } from "./pages/Market.js";
import { Account } from "./pages/Account.js";
import { Ranking } from "./pages/Ranking.js";
import { Rules } from "./pages/Rules.js";
import { Dev } from "./pages/Dev.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { BuildingSwitch, HostileAnnouncer, useHostile } from "./ui/BuildingSwitch.js";
import { applyTheme, storedTheme, type Theme } from "./theme.js";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

const PAGES = [
  ["overview", "V", Overview],
  ["book", "L", Book],
  ["map", "P", MapPage],
  ["missions", "M", Missions],
  ["reports", "I", Reports],
  ["family", "F", Family],
  ["market", "C", Market],
  ["account", "A", Account],
  ["ranking", "R", Ranking],
  ["rules", "§", Rules],
  ["dev", "T", Dev],
] as const;
type PageId = (typeof PAGES)[number][0];

// On a phone the thumb index keeps these; the rest fold under "More".
const PRIMARY: readonly PageId[] = ["overview", "book", "map", "missions"];

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

function Spine({ children, building }: { children?: React.ReactNode; building?: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<Theme>(storedTheme);
  return (
    <header className="spine">
      <h1>{t("title")}</h1>
      {building}
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
  // Gnosis Chain. With passkeys (`pnpm dev:aa`) it shows too, without the account switcher.
  const pages = PAGES.filter(([id]) => id !== "dev" || g.network.id === "local");
  // The rules are reference, opened from the spine: the thumb index keeps the game's sections.
  const tabs = pages.filter(([id]) => id !== "rules");
  // With several buildings the game opens on the whole account, as the original did.
  const landing = g.myBuildings.length > 1 ? "overview" : "book";
  const page =
    pages.find(([id]) => id === (path || landing)) ?? pages.find(([id]) => id === "book")!;
  const Page = page[2];
  const signedOut = g.signer.mode === "passkey" && !g.address;
  return (
    <div className="binding">
      <Spine building={<BuildingSwitch />}>
        <a
          className="spine-link"
          href="#/rules"
          aria-label={t("nav.rules")}
          aria-current={page[0] === "rules" ? "page" : undefined}
        >
          <span aria-hidden="true">§</span>
          <span className="label">{t("nav.rules")}</span>
        </a>
        {signedOut ? (
          <button className="btn quiet" disabled={g.busy} onClick={() => void g.signIn()}>
            {t("entry.signIn")}
          </button>
        ) : (
          <span>{g.me ? `#${g.me.id}` : "—"}</span>
        )}
      </Spine>
      <main className="page" id="page">
        <GameGuide />
        <Page key={`${path}-${g.address ?? ""}`} />
      </main>
      <ThumbIndex tabs={tabs} current={page[0]} />
      <HostileAnnouncer />
      <Toasts />
    </div>
  );
}

function ThumbIndex({
  tabs,
  current,
}: {
  tabs: readonly (typeof PAGES)[number][];
  current: PageId;
}) {
  const { t } = useTranslation();
  const hostile = useHostile().length;
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const rest = tabs.filter(([id]) => !PRIMARY.includes(id));
  const shown = rest.find(([id]) => id === current);
  useEffect(() => setOpen(false), [current]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("a")?.focus();
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof PointerEvent && more.current?.parentElement?.contains(e.target as Node))
        return;
      setOpen(false);
      if (e instanceof KeyboardEvent) more.current?.focus();
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);
  const link = ([id, letter]: (typeof PAGES)[number]) => (
    <a key={id} href={`#/${id}`} aria-current={current === id ? "page" : undefined}>
      <span className="letter" aria-hidden="true">
        {letter}
      </span>
      {t(`nav.${id}`)}
      {hostile > 0 && (id === "overview" || id === "missions") && (
        <>
          <span className="badge" aria-hidden="true">
            {hostile}
          </span>
          <span className="visually-hidden"> · {t("switch.alarm")}</span>
        </>
      )}
    </a>
  );
  return (
    <nav className="thumb-index" aria-label={t("nav.index")}>
      {tabs.filter(([id]) => PRIMARY.includes(id)).map(link)}
      <button
        ref={more}
        type="button"
        className="more"
        aria-expanded={open}
        aria-controls="more-pages"
        aria-current={shown ? "page" : undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="letter" aria-hidden="true">
          {shown ? shown[1] : "+"}
        </span>
        {shown ? t(`nav.${shown[0]}`) : t("nav.more")}
      </button>
      {/* On a phone a sheet above the index; on a wide screen the rest of the fore edge. */}
      <div id="more-pages" className="more-pages" ref={panel} hidden={!open}>
        {rest.map(link)}
      </div>
    </nav>
  );
}
