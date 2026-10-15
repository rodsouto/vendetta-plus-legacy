// UI texts in Spanish and English, taken from application/languages/vendetta/{es,en}.php.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "./es.json" with { type: "json" };
import en from "./en.json" with { type: "json" };

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: "es",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
