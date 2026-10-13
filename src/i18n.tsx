import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LANGUAGE,
  readLocale,
  saveLocale,
  translate,
  type Locale,
  type MessageValues,
} from "./i18n/core";

interface I18nContextValue {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(message: string, values?: MessageValues): string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: LANGUAGE.defaultLocale,
  setLocale: saveLocale,
  t: (message, values) => translate(message, LANGUAGE.defaultLocale, values),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(readLocale);
  useEffect(() => {
    saveLocale(locale);
    document.documentElement.lang = locale;
    document.title = translate(LANGUAGE.pageTitle, locale);
  }, [locale]);
  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (message: string, values?: MessageValues) =>
        translate(message, locale, values),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="language-switch" role="group" aria-label={t("语言")}>
      <button
        type="button"
        lang="en"
        aria-label="English"
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
      >
        EN
      </button>
      <button
        type="button"
        lang="zh-CN"
        aria-label="简体中文"
        aria-pressed={locale === "zh-CN"}
        onClick={() => setLocale("zh-CN")}
      >
        中文
      </button>
    </div>
  );
}
