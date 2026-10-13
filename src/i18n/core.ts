import { EN_MESSAGES, EN_SINGULAR } from "./messages";

export type Locale = "zh-CN" | "en";
export type MessageValues = Record<string, string | number>;
export const LANGUAGE = {
  storageKey: "arcbatch.language",
  defaultLocale: "en" as Locale,
  pageTitle: "ArcBatch · 社区奖励发放",
} as const;

// Keep legacy error text in storage; translate only for display without rewriting payment records.
const ERROR_PATTERNS: {
  pattern: RegExp;
  key: string;
  fields: string[];
}[] = [
  {
    pattern: /^本地存储无法读取：([\s\S]*)$/,
    key: "本地存储无法读取：{error}",
    fields: ["error"],
  },
  {
    pattern: /^草稿保存失败：([\s\S]*)。付款前必须修复存储。$/,
    key: "草稿保存失败：{error}。付款前必须修复存储。",
    fields: ["error"],
  },
  {
    pattern: /^不允许的状态转换：(\w+) → (\w+)$/,
    key: "不允许的状态转换：{state} → {event}",
    fields: ["state", "event"],
  },
  {
    pattern: /^CSV 格式错误：([\s\S]*)$/,
    key: "CSV 格式错误：{error}",
    fields: ["error"],
  },
  {
    pattern: /^第 (\d+) 行列数与表头不一致$/,
    key: "第 {row} 行列数与表头不一致",
    fields: ["row"],
  },
  {
    pattern: /^第 (\d+) 行需要地址和金额，用空格或制表符分隔$/,
    key: "第 {row} 行需要地址和金额，用空格或制表符分隔",
    fields: ["row"],
  },
  {
    pattern: /^人数超过合约上限 (\d+)$/,
    key: "人数超过合约上限 {limit}",
    fields: ["limit"],
  },
  {
    pattern: /^第 (\d+) 行：([\s\S]*)$/,
    key: "第 {row} 行：{error}",
    fields: ["row", "error"],
  },
];

export function translate(
  message: string,
  locale: Locale,
  values: MessageValues = {},
): string {
  let text = message;
  if (locale === "en") {
    const translated = Object.hasOwn(EN_MESSAGES, message)
      ? EN_MESSAGES[message]
      : undefined;
    if (translated !== undefined) {
      text =
        values.count === 1 ? (EN_SINGULAR[message] ?? translated) : translated;
    } else {
      for (const { pattern, key, fields } of ERROR_PATTERNS) {
        const match = message.match(pattern);
        if (match) {
          const params = Object.fromEntries(
            fields.map((field, index) => [
              field,
              field === "error"
                ? translate(match[index + 1], locale)
                : match[index + 1],
            ]),
          );
          return translate(key, locale, params);
        }
      }
      // Preserve address and amount parameters attached to contract errors.
      const contractError = message.match(/^(.+)（(.+)）$/);
      if (contractError && Object.hasOwn(EN_MESSAGES, contractError[1])) {
        return `${EN_MESSAGES[contractError[1]]} (${contractError[2]})`;
      }
    }
  }
  return text.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  );
}

export function readLocale(): Locale {
  try {
    const stored = localStorage.getItem(LANGUAGE.storageKey);
    return stored === "en" || stored === "zh-CN"
      ? stored
      : LANGUAGE.defaultLocale;
  } catch {
    return LANGUAGE.defaultLocale;
  }
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(LANGUAGE.storageKey, locale);
  } catch {
    // Language switching still works for this session when storage is unavailable.
  }
}
