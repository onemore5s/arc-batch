import { useI18n } from "./i18n";
import { useEffect, useRef, type CSSProperties } from "react";
import {
  Check,
  CheckCheck,
  CircleAlert,
  Radio,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { BatchRecord } from "./domain/types";

const STEPS = [
  { id: "check", label: "付款检查", icon: ShieldCheck },
  { id: "wallet", label: "钱包签名", icon: Wallet },
  { id: "chain", label: "链上确认", icon: Radio },
  { id: "complete", label: "发放完成", icon: CheckCheck },
] as const;
type Step = (typeof STEPS)[number]["id"];
type Mode = "idle" | "active" | "attention" | "failed" | "complete";
type FlowState = { step: Step; mode: Mode; title: string; detail: string };
const MODE_LABELS: Record<Mode, string> = {
  idle: "等待操作",
  active: "处理中",
  attention: "需要核验",
  failed: "未完成",
  complete: "已完成",
};
const LOG_VISIBLE_COUNT = 4;
const FLOW_STATES = {
  check: {
    step: "check",
    mode: "idle",
    title: "需要检查付款条件",
    detail: "请检查付款钱包、网络及余额后继续。",
  },
  checking: {
    step: "check",
    mode: "active",
    title: "正在检查付款条件",
    detail: "正在核对钱包、网络、余额与预计手续费。",
  },
  ready: {
    step: "wallet",
    mode: "idle",
    title: "等待你确认付款",
    detail: "核对下方名单与金额，然后发起钱包签名。",
  },
  signing: {
    step: "wallet",
    mode: "active",
    title: "请在钱包中确认",
    detail: "签名请求已发出，请打开钱包核对并确认这笔交易。",
  },
  pending: {
    step: "chain",
    mode: "active",
    title: "等待链上回执",
    detail: "交易已提交，正在等待确认并核验每位收款人的发放结果。",
  },
  unknownSignature: {
    step: "wallet",
    mode: "attention",
    title: "签名结果待核验",
    detail: "尚未获得交易哈希，请继续查询，核验结果后再决定是否重试。",
  },
  unknown: {
    step: "chain",
    mode: "attention",
    title: "发放结果待核验",
    detail: "尚未取得完整的链上证据，请继续查询这笔交易。",
  },
  reverted: {
    step: "chain",
    mode: "failed",
    title: "交易已回滚",
    detail: "本批奖励未发放，仍可能产生手续费。核验后可重试原批次。",
  },
  cancelled: {
    step: "chain",
    mode: "attention",
    title: "交易已取消",
    detail: "本次交易未完成发放，核验后可重试原批次。",
  },
  rejected: {
    step: "check",
    mode: "idle",
    title: "签名已取消，可重新确认",
    detail: "本次签名请求未提交交易，重新检查付款条件后可以再次发起。",
  },
  complete: {
    step: "complete",
    mode: "complete",
    title: "全部收款事件已核验",
    detail: "本批奖励发放完成，可在下方查看交易或导出发放报告。",
  },
} satisfies Record<string, FlowState>;

function getFlowState(
  record: BatchRecord,
  preflightReady: boolean,
  checking: boolean,
): FlowState {
  const attempt = record.attempts.at(-1);
  switch (record.status) {
    case "draft":
    case "ready":
      if (checking) return FLOW_STATES.checking;
      if (preflightReady) return FLOW_STATES.ready;
      return attempt?.errorClass === "signature_rejected"
        ? FLOW_STATES.rejected
        : FLOW_STATES.check;
    case "awaiting_signature":
      return FLOW_STATES.signing;
    case "pending":
      return FLOW_STATES.pending;
    case "confirmed":
      return record.evidence ? FLOW_STATES.complete : FLOW_STATES.unknown;
    case "reverted":
      return FLOW_STATES.reverted;
    case "cancelled":
      return FLOW_STATES.cancelled;
    case "unknown":
      return attempt?.currentHash || attempt?.originalHash
        ? FLOW_STATES.unknown
        : FLOW_STATES.unknownSignature;
  }
}

export function PaymentFlow({
  record,
  preflightReady = false,
  checking = false,
}: {
  record: BatchRecord;
  preflightReady?: boolean;
  checking?: boolean;
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (record.status === "awaiting_signature") {
      panel.current!.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }, [record.localId, record.status]);
  const state = getFlowState(record, preflightReady, checking);
  const currentIndex = STEPS.findIndex((step) => step.id === state.step);
  const finished = state.mode === "complete";
  const needsAttention = state.mode === "attention" || state.mode === "failed";
  const latestAttempt = record.attempts.at(-1);
  const submittedHash =
    latestAttempt?.currentHash || latestAttempt?.originalHash;
  const events = [{ id: "roster", text: "收款名单已保存" }];
  if (currentIndex > 0) events.push({ id: "check", text: "付款条件已检查" });
  if (latestAttempt && !["draft", "ready"].includes(record.status))
    events.push({
      id: `${latestAttempt.id}-signature`,
      text: "签名请求已发起",
    });
  if (submittedHash && !["draft", "ready"].includes(record.status))
    events.push({
      id: `${latestAttempt.id}-broadcast`,
      text: "交易已提交至网络",
    });
  if (finished) events.push({ id: "verified", text: "交易回执与全部事件匹配" });

  return (
    <section
      ref={panel}
      className="payment-flow"
      aria-label={t("发放流程")}
      data-mode={state.mode}
      style={{ "--flow-step-count": STEPS.length } as CSSProperties}
    >
      <header className="flow-header">
        <h2>
          {t("发放流程")}{" "}
          <span>{t("{count} 个步骤", { count: STEPS.length })}</span>
        </h2>
        <span className="flow-mode">
          <i aria-hidden="true" />
          {t(MODE_LABELS[state.mode])}
        </span>
      </header>
      <div className="flow-surface">
        <div className="flow-batch">
          <span>{t("本批次")}</span>
          <strong>{record.activityName || t("未命名奖励")}</strong>
          <span>
            {t("{count} 位收款人", {
              count: record.snapshot.recipients.length,
            })}
          </span>
        </div>
        <div className="flow-diagram">
          <ol className="flow-steps" aria-label={t("付款步骤")}>
            {STEPS.map(({ id, label, icon: Icon }, index) => {
              const current = index === currentIndex;
              const done = finished || index < currentIndex;
              return (
                <li
                  key={id}
                  data-state={done ? "done" : current ? "current" : "upcoming"}
                  aria-current={current ? "step" : undefined}
                >
                  <span className="flow-icon" aria-hidden="true">
                    <Icon size={20} />
                    {done && (
                      <span className="flow-check">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                    {current && needsAttention && (
                      <span className="flow-check">
                        <CircleAlert size={12} />
                      </span>
                    )}
                  </span>
                  <span className="flow-step-label">{t(label)}</span>
                  <span className="flow-step-state">
                    {done
                      ? t("已完成")
                      : current
                        ? state.mode === "active"
                          ? t("进行中")
                          : needsAttention
                            ? t("待处理")
                            : t("待操作")
                        : t("未开始")}
                  </span>
                </li>
              );
            })}
          </ol>
          <div
            className="flow-track"
            aria-hidden="true"
            style={
              {
                "--flow-progress": `${(currentIndex / (STEPS.length - 1)) * 100}%`,
              } as CSSProperties
            }
          >
            <span className="flow-track-fill" />
            <span className="flow-track-head" />
          </div>
        </div>
        <div className="flow-log">
          <div className="flow-log-heading">
            <span>{t("执行记录")}</span>
            <span>{latestAttempt ? t("本次付款尝试") : t("名单准备就绪")}</span>
          </div>
          <ol aria-label={t("发放执行记录")}>
            {events.slice(-LOG_VISIBLE_COUNT).map((event) => (
              <li key={event.id}>
                <span aria-hidden="true" />
                {t(event.text)}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="flow-status" role="status" aria-atomic="true">
        <span className="flow-status-icon" aria-hidden="true">
          {finished ? (
            <CheckCheck size={16} />
          ) : needsAttention ? (
            <CircleAlert size={16} />
          ) : (
            <span />
          )}
        </span>
        <div>
          <strong>{t(state.title)}</strong>
          <p>{t(state.detail)}</p>
        </div>
      </div>
    </section>
  );
}
