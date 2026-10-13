import { useI18n } from "./i18n";
import { useEffect, useRef } from "react";
import { ArrowDownToLine, Check, ChevronRight, X } from "lucide-react";
import { formatNative } from "./domain/amount";
import type { BatchRecord } from "./domain/types";

export function CompletionNotice({
  record,
  onView,
  onExport,
  onDismiss,
}: {
  record: BatchRecord;
  onView(): void;
  onExport(): void;
  onDismiss(): void;
}) {
  const { t } = useI18n();
  const notice = useRef<HTMLElement>(null);
  useEffect(() => {
    notice.current!.scrollIntoView({ block: "start", behavior: "auto" });
  }, [record.localId]);
  return (
    <section
      ref={notice}
      className="completion-notice"
      aria-label={t("本次发放结果")}
    >
      <span className="completion-mark" aria-hidden="true">
        <Check size={20} />
      </span>
      <div className="completion-content">
        <div role="status">
          <h2>{t("发放完成")}</h2>
          <p>
            <strong>
              {formatNative(BigInt(record.snapshot.totalNative))} USDC
            </strong>{" "}
            {t("已发放至 {count} 位收款人", {
              count: record.snapshot.recipients.length,
            })}
          </p>
        </div>
        <p className="completion-hint">
          {t("新名单已准备好，可以继续导入下一批。")}
        </p>
        <div className="completion-actions">
          <button className="plain" onClick={onView}>
            {t("查看本次详情")} <ChevronRight size={14} />
          </button>
          <button className="plain" onClick={onExport}>
            <ArrowDownToLine size={14} />
            {t("导出报告")}
          </button>
        </div>
      </div>
      <button
        className="icon-button completion-dismiss"
        aria-label={t("关闭发放结果")}
        onClick={onDismiss}
      >
        <X size={16} />
      </button>
    </section>
  );
}
