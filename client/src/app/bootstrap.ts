import i18n from "i18next";
import Backend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { listenSystemMode } from "../utils/darkModeUtils";

let bootstrapped = false;

export function bootstrapApp() {
  if (bootstrapped) {
    return;
  }

  listenSystemMode();

  i18n
    .use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      backend: {
        loadPath: "/locales/{{lng}}/{{ns}}.json",
      },
      fallbackLng: {
        'zh-TW': ['zh-CN', 'en'],
        'zh-HK': ['zh-CN', 'en'],
        'zh-MO': ['zh-CN', 'en'],
        'zh': ['zh-CN', 'en'],
        'default': ['en']
      },
      supportedLngs: ["en", "zh-CN"],
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ['querystring', 'localStorage', 'navigator'],
        lookupQuerystring: 'lng',
        lookupLocalStorage: 'i18nextLng',
        caches: ['localStorage'],
      }
    });

  bootstrapped = true;
}
