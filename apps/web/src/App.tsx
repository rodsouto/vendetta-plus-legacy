import { useTranslation } from "react-i18next";
import { rulesets } from "@vendetta/rules";

export function App() {
  const { t, i18n } = useTranslation();
  return (
    <main>
      <h1>{t("title")}</h1>
      <label>
        {t("language")}{" "}
        <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)}>
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </label>
      <ul>
        <li>{t("resources")}</li>
        <li>{t("buildings")}</li>
        <li>{t("missions")}</li>
      </ul>
      <p>
        {rulesets.vendetta.troops.length} troops · {rulesets.vendetta.buildings.length} rooms
      </p>
    </main>
  );
}
