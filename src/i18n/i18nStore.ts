import { create } from "zustand";

export type AppLocale = "en" | "de" | "fr" | "ar";

type LocaleState = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  formatDateTime: (value: string | number | Date) => string;
  formatNumber: (value: number) => string;
  t: (key: TranslationKey) => string;
};

export const localeOptions: Array<{ id: AppLocale; label: string; dir: "ltr" | "rtl" }> = [
  { id: "en", label: "English", dir: "ltr" },
  { id: "de", label: "Deutsch", dir: "ltr" },
  { id: "fr", label: "Francais", dir: "ltr" },
  { id: "ar", label: "Arabic", dir: "rtl" },
];

const STORAGE_KEY = "cansim.locale.v1";

const translations = {
  en: {
    "nav.monitor": "CAN Monitor",
    "nav.terminal": "Terminal Trace",
    "nav.simulator": "Simulator",
    "nav.profileEditor": "Profile Editor",
    "nav.settings": "Settings",
    "nav.help": "Help",
    "menu.file": "File",
    "menu.view": "View",
    "menu.can": "CAN",
    "menu.help": "Help",
    "settings.title": "Settings",
    "settings.subtitle": "Configure appearance, monitor retention, localization, and CAN-FD defaults.",
    "settings.localization": "Localization",
    "settings.language": "Language",
    "settings.localizationDescription": "Language controls selected UI labels, date and number formatting, and document direction.",
    "settings.appearance": "Appearance",
    "settings.diagnostics": "Diagnostics log",
    "settings.backup": "Backup and restore",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.clear": "Clear",
  },
  de: {
    "nav.monitor": "CAN Monitor",
    "nav.terminal": "Terminal Trace",
    "nav.simulator": "Simulator",
    "nav.profileEditor": "Profil-Editor",
    "nav.settings": "Einstellungen",
    "nav.help": "Hilfe",
    "menu.file": "Datei",
    "menu.view": "Ansicht",
    "menu.can": "CAN",
    "menu.help": "Hilfe",
    "settings.title": "Einstellungen",
    "settings.subtitle": "Darstellung, Trace-Aufbewahrung, Lokalisierung und CAN-FD-Defaults konfigurieren.",
    "settings.localization": "Lokalisierung",
    "settings.language": "Sprache",
    "settings.localizationDescription": "Die Sprache steuert ausgewählte UI-Texte, Datums- und Zahlenformate sowie die Schreibrichtung.",
    "settings.appearance": "Darstellung",
    "settings.diagnostics": "Diagnoseprotokoll",
    "settings.backup": "Sichern und Wiederherstellen",
    "common.cancel": "Abbrechen",
    "common.save": "Speichern",
    "common.clear": "Leeren",
  },
  fr: {
    "nav.monitor": "Moniteur CAN",
    "nav.terminal": "Trace Terminal",
    "nav.simulator": "Simulateur",
    "nav.profileEditor": "Editeur de profils",
    "nav.settings": "Parametres",
    "nav.help": "Aide",
    "menu.file": "Fichier",
    "menu.view": "Vue",
    "menu.can": "CAN",
    "menu.help": "Aide",
    "settings.title": "Parametres",
    "settings.subtitle": "Configurer l'apparence, la retention du moniteur, la localisation et les valeurs CAN-FD.",
    "settings.localization": "Localisation",
    "settings.language": "Langue",
    "settings.localizationDescription": "La langue controle certains libelles, les formats de date et de nombre, et la direction du document.",
    "settings.appearance": "Apparence",
    "settings.diagnostics": "Journal de diagnostic",
    "settings.backup": "Sauvegarde et restauration",
    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.clear": "Effacer",
  },
  ar: {
    "nav.monitor": "CAN Monitor",
    "nav.terminal": "Terminal Trace",
    "nav.simulator": "Simulator",
    "nav.profileEditor": "Profile Editor",
    "nav.settings": "Settings",
    "nav.help": "Help",
    "menu.file": "File",
    "menu.view": "View",
    "menu.can": "CAN",
    "menu.help": "Help",
    "settings.title": "Settings",
    "settings.subtitle": "Configure appearance, monitor retention, localization, and CAN-FD defaults.",
    "settings.localization": "Localization",
    "settings.language": "Language",
    "settings.localizationDescription": "Arabic selection enables right-to-left layout direction and Arabic locale date and number formatting.",
    "settings.appearance": "Appearance",
    "settings.diagnostics": "Diagnostics log",
    "settings.backup": "Backup and restore",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.clear": "Clear",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

function readLocale(): AppLocale {
  if (typeof localStorage === "undefined") return "en";
  const value = localStorage.getItem(STORAGE_KEY);
  return localeOptions.some((option) => option.id === value) ? (value as AppLocale) : "en";
}

function applyDocumentLocale(locale: AppLocale) {
  if (typeof document === "undefined") return;
  const option = localeOptions.find((item) => item.id === locale) ?? localeOptions[0];
  document.documentElement.lang = locale;
  document.documentElement.dir = option.dir;
}

function translate(locale: AppLocale, key: TranslationKey) {
  return translations[locale][key] || translations.en[key];
}

const initialLocale = readLocale();
if (typeof document !== "undefined") applyDocumentLocale(initialLocale);

export const useI18nStore = create<LocaleState>((set, get) => ({
  locale: initialLocale,
  setLocale: (locale) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, locale);
    applyDocumentLocale(locale);
    set({ locale });
  },
  formatDateTime: (value) => new Intl.DateTimeFormat(get().locale, { dateStyle: "short", timeStyle: "medium" }).format(new Date(value)),
  formatNumber: (value) => new Intl.NumberFormat(get().locale).format(value),
  t: (key) => translate(get().locale, key),
}));
