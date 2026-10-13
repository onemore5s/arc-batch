import { beforeEach, afterEach } from "vitest";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nProvider } from "../src/i18n";
import { LANGUAGE } from "../src/i18n/core";

// These suites explicitly exercise Chinese; i18n tests cover the English default.
beforeEach(() => localStorage.setItem(LANGUAGE.storageKey, "zh-CN"));
afterEach(() => localStorage.removeItem(LANGUAGE.storageKey));

export function renderChinese(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: I18nProvider, ...options });
}
