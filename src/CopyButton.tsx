import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { SETTINGS } from "./config";
import { useI18n } from "./i18n";

export function CopyButton({
  value,
  label,
}: {
  value: string;
  label?: string;
}) {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState<{
    value: string;
    status: "copied" | "failed";
  }>();
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(
      () => setFeedback(undefined),
      SETTINGS.copyFeedbackMs,
    );
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const status = feedback?.value === value ? feedback.status : undefined;
  const message =
    status === "copied"
      ? t("已复制")
      : status === "failed"
        ? t("复制失败，请手动复制")
        : "";
  const title = label ? t("复制{label}", { label }) : t("复制");
  const copy = async () => {
    setFeedback(undefined);
    try {
      await navigator.clipboard.writeText(value);
      setFeedback({ value, status: "copied" });
    } catch {
      setFeedback({ value, status: "failed" });
    }
  };
  return (
    <span className="copy-control" data-feedback={status}>
      <button
        type="button"
        className="copy-button"
        aria-label={
          label
            ? t("复制{label} {value}", { label, value })
            : t("复制 {value}", { value })
        }
        title={message || title}
        onClick={() => void copy()}
      >
        {status === "copied" ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Copy size={14} aria-hidden="true" />
        )}
      </button>
      <span className="copy-tooltip" aria-hidden="true">
        {status === "failed" ? t("复制失败") : message || title}
      </span>
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </span>
    </span>
  );
}
