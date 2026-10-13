import { I18nProvider, LanguageSwitch, useI18n } from "./i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileUp,
  History,
  Plus,
  RotateCw,
  Trash2,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import { z } from "zod";
import type { Hex } from "viem";
import {
  NETWORKS,
  SETTINGS,
  STATUS_LABELS,
  RECIPIENT_STATUS_LABELS,
  WALLET_UI,
  REOWN,
  ROSTER_CSV,
  type NetworkName,
} from "./config";
import { validateRows, parseCsv, parsePaste } from "./domain/recipients";
import {
  createRecord,
  makeSnapshot,
  newBatchId,
  recordKey,
} from "./domain/batch";
import { formatNative } from "./domain/amount";
import { importBackup, exportBackup, exportReport } from "./domain/reports";
import type {
  InputRow,
  BatchRecord,
  Deployment,
  Preflight,
} from "./domain/types";
import type { RecordStore } from "./storage";
import type { Gateway, WalletContext } from "./chain/types";
import {
  preflight,
  prepareRetry,
  recoverBatch,
  submitBatch,
} from "./chain/service";
import {
  deploymentNetwork,
  restoreTransaction,
  validateDeployment,
} from "./chain/adapters";
import { errorMessage, download } from "./ui-utils";
import { SelectMenu } from "./SelectMenu";
import { WalletDialog } from "./WalletDialog";
import { PaymentFlow } from "./PaymentFlow";
import { CompletionNotice } from "./CompletionNotice";
import { CopyButton } from "./CopyButton";
import { NetworkBadge } from "./NetworkBadge";
import type { WalletRuntime } from "./wallet-runtime";
export interface Runtime extends WalletRuntime {
  store: RecordStore & {
    subscribe?(callback: () => void): () => void;
    saveDraft?(value: unknown): Promise<void>;
    loadDraft?(): Promise<unknown>;
  };
  deployments: Deployment[];
  gateway(chainId: number): Gateway;
  configurationError?: string;
}
const draftSchema = z.object({
  activityName: z.string().max(SETTINGS.maxTextLength),
  rows: z.array(
    z.object({
      sourceRow: z.number().int().positive(),
      address: z.string(),
      amount: z.string(),
      label: z.string().max(SETTINGS.maxTextLength),
    }),
  ),
});
const abbreviate = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
const ROSTER_FIELDS = {
  address: {
    label: "收款地址",
    accessibleLabel: "第 {row} 行地址",
    placeholder: "输入钱包地址 0x…",
  },
  amount: {
    label: "金额 / USDC",
    accessibleLabel: "第 {row} 行金额",
    placeholder: "填写金额",
  },
  label: {
    label: "标签 · 选填",
    accessibleLabel: "第 {row} 行标签",
    placeholder: "添加备注",
  },
} as const;
export function App({ runtime }: { runtime: Runtime }) {
  return (
    <I18nProvider>
      <Application runtime={runtime} />
    </I18nProvider>
  );
}
function Application({ runtime }: { runtime: Runtime }) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<"rewards" | "history" | "help">("rewards");
  const [network, setNetwork] = useState<NetworkName>(() =>
      deploymentNetwork(runtime.deployments),
    ),
    [walletIndex, setWalletIndex] = useState(0),
    [context, setContext] = useState<WalletContext>();
  const [walletDialogOpen, setWalletDialogOpen] = useState(false),
    [connectingWallet, setConnectingWallet] = useState<number>(),
    [walletError, setWalletError] = useState("");
  const [balance, setBalance] = useState<bigint>(),
    [rows, setRows] = useState<InputRow[]>([]),
    [activityName, setActivityName] = useState("");
  const [touchedFields, setTouchedFields] = useState<Set<string>>(
    () => new Set(),
  );
  const [clearedRoster, setClearedRoster] = useState<{
    rows: InputRow[];
    touchedFields: Set<string>;
    paste: string;
    pasteOpen: boolean;
  }>();
  const rosterHeading = useRef<HTMLHeadingElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (clearedRoster) undoButton.current?.focus();
  }, [clearedRoster]);
  const [paste, setPaste] = useState(""),
    [pasteOpen, setPasteOpen] = useState(false),
    [records, setRecords] = useState<BatchRecord[]>([]),
    [selected, setSelected] = useState<BatchRecord>();
  const [activePaymentKey, setActivePaymentKey] = useState<string>(),
    [completed, setCompleted] = useState<BatchRecord>();
  const [check, setCheck] = useState<Preflight>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [configError, setConfigError] = useState(runtime.configurationError ?? ""),
    [configValid, setConfigValid] = useState(false),
    [booted, setBooted] = useState(false),
    [txInput, setTxInput] = useState("");
  const chain = NETWORKS[network],
    wallet = runtime.wallets[walletIndex],
    deployment = runtime.deployments.find((d) => d.chainId === chain.id);
  const validated = useMemo(
    () =>
      validateRows(rows, {
        payer: context?.payer,
        contract: deployment?.contractAddress,
        maxRecipients: deployment
          ? Number(deployment.maxRecipients)
          : undefined,
      }),
    [rows, context?.payer, deployment],
  );
  const replaceRows = (nextRows: InputRow[], imported = false) => {
    setClearedRoster(undefined);
    setRows(nextRows);
    setTouchedFields(
      new Set(
        imported
          ? nextRows.flatMap((row) =>
              Object.keys(ROSTER_FIELDS).map(
                (field) => `${row.sourceRow}:${field}`,
              ),
            )
          : [],
      ),
    );
  };
  const refresh = useCallback(async () => {
    const all = await runtime.store.list();
    setRecords(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setSelected((previous) =>
      previous
        ? (all.find(
            (r) => recordKey(r.snapshot) === recordKey(previous.snapshot),
          ) ?? previous)
        : undefined,
    );
  }, [runtime]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const openWalletSelector = () => {
    if (runtime.openWallet) {
      void act(async () => {
        try {
          await runtime.openWallet!();
        } catch {
          throw new Error(REOWN.loadError);
        }
      });
    } else setWalletDialogOpen(true);
  };
  const connectWallet = async (index: number) => {
    setBusy(true);
    setConnectingWallet(index);
    setWalletError("");
    setCheck(undefined);
    try {
      const connected = await runtime.wallets[index].connect();
      setWalletIndex(index);
      setContext(connected);
      setCheck(undefined);
      setWalletDialogOpen(false);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      setWalletError(
        code === WALLET_UI.rejectedCode
          ? WALLET_UI.rejectedMessage
          : code === WALLET_UI.pendingRequestCode
            ? WALLET_UI.pendingMessage
            : WALLET_UI.failedMessage,
      );
    } finally {
      setBusy(false);
      setConnectingWallet(undefined);
    }
  };
  useEffect(() => {
    let live = true;
    void Promise.all([runtime.store.list(), runtime.store.loadDraft?.()])
      .then(([all, draft]) => {
        if (!live) return;
        setRecords(all);
        if (draft !== undefined) {
          const saved = draftSchema.parse(draft);
          setRows(saved.rows);
          setTouchedFields(new Set());
          setClearedRoster(undefined);
          setActivityName(saved.activityName);
        }
      })
      .catch((e) => {
        if (live) setError(`本地存储无法读取：${errorMessage(e)}`);
      })
      .finally(() => {
        if (live) setBooted(true);
      });
    return () => {
      live = false;
    };
  }, [runtime]);
  useEffect(
    () =>
      runtime.store.subscribe?.(() => {
        void refresh().catch((e) => setError(errorMessage(e)));
      }),
    [refresh, runtime],
  );
  useEffect(() => {
    if (booted)
      void runtime.store
        .saveDraft?.({ rows, activityName })
        .catch((e) =>
          setError(`草稿保存失败：${errorMessage(e)}。付款前必须修复存储。`),
        );
  }, [rows, activityName, booted, runtime]);
  useEffect(() => {
    let live = true;
    setConfigValid(false);
    setCheck(undefined);
    if (!deployment) {
      setConfigError(
        runtime.configurationError ?? "尚未配置合约部署清单，付款暂不可用",
      );
      return;
    }
    void validateDeployment(deployment, runtime.gateway(chain.id)).then(
      () => {
        if (live) {
          setConfigValid(true);
          setConfigError("");
        }
      },
      (e) => {
        if (live) setConfigError(errorMessage(e));
      },
    );
    return () => {
      live = false;
    };
  }, [deployment, chain.id, runtime]);
  useEffect(
    () =>
      wallet?.subscribe((c) => {
        setContext(c);
        setCheck(undefined);
      }),
    [wallet],
  );
  useEffect(() => {
    let live = true;
    setBalance(undefined);
    setCheck(undefined);
    if (context)
      void runtime
        .gateway(chain.id)
        .balance(context.payer)
        .then(
          (value) => {
            if (live) setBalance(value);
          },
          () => {},
        );
    return () => {
      live = false;
    };
  }, [context, chain.id, runtime]);
  useEffect(() => {
    if (busy) return;
    const recover = async () => {
      const current = await runtime.store.list();
      for (const record of current.filter((r) =>
        ["pending", "unknown", "awaiting_signature"].includes(r.status),
      )) {
        try {
          const next = await recoverBatch(
            record,
            runtime.gateway(record.snapshot.chainId),
          );
          await runtime.store.save(next);
        } catch {
          /* RPC failures do not change the payment outcome. */
        }
      }
      await refresh();
    };
    const timer = setInterval(() => {
      void recover().catch(() => {});
    }, SETTINGS.pollMs);
    return () => clearInterval(timer);
  }, [busy, runtime, refresh]);
  useEffect(() => {
    if (
      !busy &&
      activePaymentKey &&
      selected?.status === "confirmed" &&
      selected.evidence &&
      recordKey(selected.snapshot) === activePaymentKey
    ) {
      setCompleted(selected);
      setActivePaymentKey(undefined);
      setSelected(undefined);
      setCheck(undefined);
      setRows([]);
      setTouchedFields(new Set());
      setClearedRoster(undefined);
      setActivityName("");
      setPaste("");
      setPasteOpen(false);
    }
  }, [selected, activePaymentKey, busy]);
  const review = () =>
    act(async () => {
      if (
        !deployment ||
        !configValid ||
        !context ||
        !wallet ||
        validated.errors.length
      )
        throw new Error("请先完成名单校验、部署配置与钱包连接");
      const snapshot = makeSnapshot({
        payer: context.payer,
        contractAddress: deployment.contractAddress,
        chainId: chain.id,
        batchId: newBatchId(),
        recipients: validated.recipients,
      });
      const duplicate = records.filter(
        (r) =>
          r.snapshot.chainId === snapshot.chainId &&
          r.snapshot.contractAddress.toLowerCase() ===
            snapshot.contractAddress.toLowerCase() &&
          r.snapshot.payer.toLowerCase() === snapshot.payer.toLowerCase() &&
          r.snapshot.payloadHash === snapshot.payloadHash,
      );
      if (
        duplicate.some((r) =>
          ["unknown", "pending", "awaiting_signature"].includes(r.status),
        )
      )
        throw new Error(
          "同一名单有结果待核验的批次，请到发放记录继续查询，不能创建新 ID 绕过核验",
        );
      if (
        duplicate.length &&
        !window.confirm(
          t(
            "相同名单已有历史批次。创建新批次会再次发奖，请确认已经核对历史结果。",
          ),
        )
      )
        return;
      const record = createRecord(snapshot, activityName);
      await runtime.store.save(record);
      setSelected(record);
      await refresh();
      setCheck(
        await preflight(
          snapshot,
          await wallet.context(),
          runtime.gateway(chain.id),
        ),
      );
    });
  const send = () =>
    act(async () => {
      if (
        !selected ||
        !wallet ||
        !deployment ||
        !configValid ||
        !check ||
        selected.snapshot.chainId !== chain.id ||
        selected.snapshot.contractAddress.toLowerCase() !==
          deployment.contractAddress.toLowerCase()
      )
        throw new Error("请重新复核付款信息");
      setActivePaymentKey(recordKey(selected.snapshot));
      const next = await submitBatch(
        selected,
        runtime.store,
        runtime.gateway(selected.snapshot.chainId),
        wallet,
        setSelected,
      );
      setSelected(next);
      setCheck(undefined);
      await refresh();
      setBalance(
        await runtime
          .gateway(selected.snapshot.chainId)
          .balance(selected.snapshot.payer),
      );
    });
  const continueQuery = (record: BatchRecord) =>
    act(async () => {
      const next = await recoverBatch(
        record,
        runtime.gateway(record.snapshot.chainId),
      );
      await runtime.store.save(next);
      setSelected(next);
      await refresh();
    });
  const retry = (record: BatchRecord) =>
    act(async () => {
      if (
        !wallet ||
        !context ||
        !deployment ||
        !configValid ||
        record.snapshot.payer.toLowerCase() !== context.payer.toLowerCase() ||
        record.snapshot.chainId !== chain.id ||
        record.snapshot.contractAddress.toLowerCase() !==
          deployment.contractAddress.toLowerCase()
      )
        throw new Error("请连接原付款钱包并切换到该批次网络与合约");
      if (
        !window.confirm(
          t(
            "沿用原批次 ID 和冻结名单重试。原交易与重试交易可能都产生手续费，但合约最多完成一次发奖。",
          ),
        )
      )
        return;
      const next = await prepareRetry(
        record,
        runtime.store,
        runtime.gateway(record.snapshot.chainId),
      );
      setSelected(next);
      setTab("rewards");
      setCheck(
        await preflight(
          next.snapshot,
          await wallet.context(),
          runtime.gateway(record.snapshot.chainId),
        ),
      );
      await refresh();
    });
  const importFile = (file: File | undefined, kind: "csv" | "backup") => {
    if (!file) return;
    void act(async () => {
      if (file.size > SETTINGS.maxFileBytes)
        throw new Error("文件超过大小上限");
      const text = await file.text();
      if (kind === "csv") {
        replaceRows(parseCsv(text), true);
        setSelected(undefined);
        setCheck(undefined);
      } else {
        for (const record of importBackup(text))
          await runtime.store.save(record);
        await refresh();
        setTab("history");
      }
    });
  };
  const restore = () =>
    act(async () => {
      if (!deployment || !configValid)
        throw new Error("需要有效部署清单才能从交易恢复");
      const record = await restoreTransaction(
        txInput.trim() as Hex,
        deployment,
        runtime.gateway(chain.id),
      );
      const old = await runtime.store.get(record.snapshot);
      if (old) {
        const next = await recoverBatch(old, runtime.gateway(chain.id));
        await runtime.store.save(next);
        setSelected(next);
      } else {
        await runtime.store.save(record);
        setSelected(record);
      }
      await refresh();
    });
  const editRow = (
    i: number,
    key: "address" | "amount" | "label",
    value: string,
  ) => {
    setRows((previous) =>
      previous.map((r, index) => (index === i ? { ...r, [key]: value } : r)),
    );
    setCheck(undefined);
  };
  const renderRecipientField = (
    row: InputRow,
    index: number,
    field: keyof typeof ROSTER_FIELDS,
  ) => {
    const key = `${row.sourceRow}:${field}`;
    const message = touchedFields.has(key)
      ? validated.rowErrors.get(row.sourceRow)?.[field]
      : undefined;
    const errorId = `recipient-${row.sourceRow}-${field}-error`;
    const spec = ROSTER_FIELDS[field];
    return (
      <>
        <span className="roster-field-label" aria-hidden="true">
          {t(spec.label)}
        </span>
        <input
          aria-label={t(spec.accessibleLabel, { row: row.sourceRow })}
          aria-invalid={Boolean(message)}
          aria-describedby={message ? errorId : undefined}
          inputMode={field === "amount" ? "decimal" : undefined}
          maxLength={field === "label" ? SETTINGS.maxTextLength : undefined}
          placeholder={t(spec.placeholder)}
          value={row[field]}
          onChange={(e) => editRow(index, field, e.target.value)}
          onBlur={() =>
            setTouchedFields((previous) => new Set(previous).add(key))
          }
        />
        {message && (
          <p id={errorId} className="field-error">
            {t(message)}
          </p>
        )}
      </>
    );
  };
  const newDraft = () => {
    setActivePaymentKey(undefined);
    setCompleted(undefined);
    setSelected(undefined);
    setCheck(undefined);
    replaceRows([]);
    setActivityName("");
    setPaste("");
    setPasteOpen(false);
    setTab("rewards");
  };
  const verified =
    selected?.status === "confirmed" && Boolean(selected.evidence);
  const returnToEditor = () => {
    if (verified && !busy) {
      setSelected(undefined);
      setCheck(undefined);
    }
    setTab("rewards");
  };
  const exportBatch = (record: BatchRecord) =>
    download(
      exportReport(record, locale),
      "text/csv",
      `${SETTINGS.brand}-report.csv`,
    );
  const disabledReason = !configValid
    ? configError
    : !context
      ? "连接钱包后复核奖励"
      : context.chainId !== chain.id
        ? "请将钱包切换到目标网络"
        : validated.errors.length
          ? "完善收款名单后即可复核"
          : "";
  const displayRows = selected?.snapshot.recipients ?? validated.recipients,
    total = selected ? BigInt(selected.snapshot.totalNative) : validated.total;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            returnToEditor();
          }}
        >
          <img
            className="brand-mark"
            src={SETTINGS.logoPath}
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
          />
          {SETTINGS.brand}
        </a>
        <LanguageSwitch />
        <nav aria-label={t("主导航")}>
          {[
            ["rewards", t("批量发放")],
            ["history", t("发放记录")],
            ["help", t("使用说明")],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "nav-active" : ""}
              aria-current={tab === key ? "page" : undefined}
              onClick={() =>
                key === "rewards" ? returnToEditor() : setTab(key as typeof tab)
              }
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="wallet-controls">
          <SelectMenu
            label={t("目标网络")}
            value={network}
            disabled={busy}
            options={Object.entries(NETWORKS).map(([key, chain]) => ({
              value: key,
              label: chain.name,
              content: <NetworkBadge chain={chain} />,
            }))}
            onChange={(value) => setNetwork(value as NetworkName)}
          />
          <button
            className="wallet-button"
            disabled={busy && connectingWallet === undefined}
            aria-label={context ? t("切换钱包") : t("连接钱包")}
            aria-haspopup="dialog"
            onClick={openWalletSelector}
          >
            <Wallet size={16} />
            {connectingWallet !== undefined
              ? t("连接中…")
              : context
                ? abbreviate(context.payer)
                : t("连接钱包")}
          </button>
        </div>
      </header>
      <main data-view={tab}>
        <div className="page-intro">
          <div>
            <h1>
              {tab === "rewards"
                ? t("批量发放 USDC")
                : tab === "history"
                  ? t("发放记录")
                  : t("使用说明")}
            </h1>
            <p>
              {tab === "rewards"
                ? t("导入收款名单，核对后通过钱包付款。")
                : tab === "history"
                  ? t("查看批次进度、核验交易并导出记录。")
                  : t("了解名单格式、付款流程和记录恢复。")}
            </p>
          </div>
        </div>
        {configError && (
          <div className="notice" role="status">
            <CircleHelp size={18} />
            <div>
              <strong>{t(configError)}</strong>
              <span>{t("名单可先整理；正式付款需要核验部署配置。")}</span>
            </div>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {t(error)}
            <button aria-label={t("关闭错误提示")} onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {context && context.chainId !== chain.id && (
          <div className="notice">
            <span>{t("钱包当前网络与目标网络不一致")}</span>
            <button
              className="outline"
              disabled={busy}
              onClick={() => {
                void act(async () => {
                  await wallet.switchNetwork(chain.id);
                  setContext(await wallet.context());
                });
              }}
            >
              {t("切换钱包到 {network}", { network: chain.name })}
            </button>
          </div>
        )}
        {tab === "rewards" && (
          <>
            {!selected && completed && (
              <CompletionNotice
                record={completed}
                onView={() => {
                  setSelected(completed);
                  setCheck(undefined);
                }}
                onExport={() => exportBatch(completed)}
                onDismiss={() => setCompleted(undefined)}
              />
            )}
            {selected && (
              <PaymentFlow
                record={selected}
                preflightReady={Boolean(check)}
                checking={busy}
              />
            )}
            <div className="workspace">
              <section className="roster-panel">
                {!selected ? (
                  <>
                    <div className="activity-field">
                      <label className="field-label" htmlFor="activity">
                        {t("活动名称")} <span>{t("选填 · 仅保存在本地")}</span>
                      </label>
                      <input
                        id="activity"
                        className="activity-input"
                        maxLength={SETTINGS.maxTextLength}
                        placeholder={t("例如：活动名称")}
                        value={activityName}
                        onChange={(e) => setActivityName(e.target.value)}
                      />
                    </div>
                    <div className="import-actions">
                      <h2 ref={rosterHeading} tabIndex={-1}>
                        {t("收款名单")}
                      </h2>
                      <label className="button outline">
                        <FileUp size={16} />
                        {t("导入 CSV")}{" "}
                        <input
                          aria-label={t("导入 CSV")}
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(e) => {
                            importFile(e.target.files?.[0], "csv");
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <button
                        className="outline"
                        aria-expanded={pasteOpen}
                        aria-controls="paste-content"
                        onClick={() => setPasteOpen(!pasteOpen)}
                      >
                        <ClipboardList size={16} />
                        {t("粘贴名单")}
                      </button>
                      <button
                        className="plain"
                        onClick={() => {
                          setClearedRoster(undefined);
                          setRows([
                            ...rows,
                            {
                              address: "",
                              amount: "",
                              label: "",
                              sourceRow:
                                Math.max(0, ...rows.map((r) => r.sourceRow)) +
                                1,
                            },
                          ]);
                        }}
                      >
                        <Plus size={16} />
                        {t("手动添加")}
                      </button>
                    </div>
                    {clearedRoster && (
                      <div className="roster-cleared" role="status">
                        <span>
                          {t("已清空 {count} 行", {
                            count: clearedRoster.rows.length,
                          })}
                        </span>
                        <button
                          ref={undoButton}
                          className="plain"
                          disabled={busy}
                          onClick={() => {
                            replaceRows(clearedRoster.rows);
                            setTouchedFields(clearedRoster.touchedFields);
                            setPaste(clearedRoster.paste);
                            setPasteOpen(clearedRoster.pasteOpen);
                            setCheck(undefined);
                            rosterHeading.current!.focus();
                          }}
                        >
                          <Undo2 size={14} />
                          {t("撤销")}
                        </button>
                      </div>
                    )}
                    {pasteOpen && (
                      <div className="paste-box" id="paste-content">
                        <label htmlFor="paste">{t("粘贴地址与金额")}</label>
                        <p>
                          {t("每行一个钱包地址和金额，用空格或制表符分隔。")}
                        </p>
                        <textarea
                          id="paste"
                          value={paste}
                          onChange={(e) => {
                            setPaste(e.target.value);
                            setClearedRoster(undefined);
                          }}
                          placeholder={t("钱包地址　奖励金额")}
                        />
                        <button
                          className="primary"
                          onClick={() => {
                            try {
                              replaceRows(parsePaste(paste), true);
                              setPasteOpen(false);
                              setError("");
                            } catch (e) {
                              setError(errorMessage(e));
                            }
                          }}
                        >
                          {t("导入粘贴内容")}
                        </button>
                      </div>
                    )}
                    <div className="roster-table">
                      {rows.length ? (
                        <table>
                          <caption className="sr-only">{t("收款名单")}</caption>
                          <colgroup>
                            <col className="roster-index-column" />
                            <col />
                            <col className="roster-amount-column" />
                            <col className="roster-label-column" />
                            <col className="roster-action-column" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th scope="col" className="roster-index">
                                <span aria-hidden="true">#</span>
                                <span className="sr-only">{t("序号")}</span>
                              </th>
                              <th scope="col">{t("收款地址")}</th>
                              <th scope="col" className="roster-amount">
                                {t("金额 / USDC")}
                              </th>
                              <th scope="col">
                                {t("标签")}{" "}
                                <span className="optional-label">
                                  {t("选填")}
                                </span>
                              </th>
                              <th scope="col">
                                <span className="sr-only">{t("操作")}</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr className="table-row" key={r.sourceRow}>
                                <th scope="row" className="roster-index">
                                  {r.sourceRow}
                                </th>
                                <td className="roster-address">
                                  {renderRecipientField(r, i, "address")}
                                </td>
                                <td className="roster-amount">
                                  {renderRecipientField(r, i, "amount")}
                                </td>
                                <td className="roster-label">
                                  {renderRecipientField(r, i, "label")}
                                </td>
                                <td className="roster-action">
                                  <button
                                    className="icon-button"
                                    aria-label={t("删除第 {row} 行", {
                                      row: r.sourceRow,
                                    })}
                                    onClick={() => {
                                      setRows(
                                        rows.filter((_, index) => index !== i),
                                      );
                                      setTouchedFields(
                                        (previous) =>
                                          new Set(
                                            [...previous].filter(
                                              (key) =>
                                                !key.startsWith(
                                                  `${r.sourceRow}:`,
                                                ),
                                            ),
                                          ),
                                      );
                                    }}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="empty-roster">
                          <h3>{t("尚未添加收款人")}</h3>
                          <p>{t("导入 CSV，或直接粘贴钱包地址与奖励金额。")}</p>
                          <div
                            className="csv-example"
                            role="region"
                            aria-label={t("CSV 格式示例")}
                          >
                            <div className="csv-example-columns">
                              {ROSTER_CSV.columns.map((column, index) => (
                                <div key={column}>
                                  <code>{column}</code>
                                  <span>
                                    {t(
                                      [
                                        "收款地址",
                                        "金额 / USDC",
                                        "标签 · 选填",
                                      ][index],
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <p>
                              {t("将模板中的占位内容替换为收款信息后再导入。")}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    {rows.length > 0 && validated.formErrors.length > 0 && (
                      <ul className="validation-errors">
                        {validated.formErrors.map((e, i) => (
                          <li key={i}>{t(e)}</li>
                        ))}
                      </ul>
                    )}
                    <div className="roster-support">
                      <p className="roster-note">
                        {t("最多 6 位小数，重复地址会阻止整个批次。")}
                      </p>
                      <div className="roster-support-actions">
                        <button
                          className="plain template-download"
                          onClick={() =>
                            download(
                              [
                                ROSTER_CSV.columns.join(","),
                                ROSTER_CSV.placeholders.join(","),
                                "",
                              ].join("\r\n"),
                              "text/csv",
                              ROSTER_CSV.fileName,
                            )
                          }
                        >
                          <ArrowDownToLine size={14} />
                          {t("下载模板")}
                        </button>
                        {rows.length > 0 && (
                          <button
                            className="plain clear-roster"
                            disabled={busy}
                            onClick={() => {
                              replaceRows([]);
                              setClearedRoster({
                                rows,
                                touchedFields,
                                paste,
                                pasteOpen,
                              });
                              setPaste("");
                              setPasteOpen(false);
                              setCheck(undefined);
                            }}
                          >
                            <Trash2 size={14} />
                            {t("清空名单")}
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="panel-heading">
                      <h2>{t("确认付款信息")}</h2>
                    </div>
                    <PaymentOverview key={selected.localId} record={selected} />
                    <ReviewRoster record={selected} />
                    <div className="atomic-notice">
                      {t(
                        "任一收款失败，本批奖励全部回滚；失败交易仍可能产生手续费。",
                      )}
                    </div>
                    <div className="batch-state">
                      <span className={`status-pill ${selected.status}`}>
                        {t(STATUS_LABELS[selected.status])}
                      </span>
                      {selected.status === "confirmed" && selected.evidence && (
                        <span>
                          <Check size={15} />
                          {t("调用和全部事件已匹配")}
                        </span>
                      )}
                    </div>
                    <PaymentAttempts record={selected} />
                    {selected.status === "ready" && !check && (
                      <button
                        className="outline"
                        disabled={busy || !wallet || !configValid}
                        onClick={() => {
                          void act(async () => {
                            setCheck(
                              await preflight(
                                selected.snapshot,
                                await wallet.context(),
                                runtime.gateway(selected.snapshot.chainId),
                              ),
                            );
                          });
                        }}
                      >
                        {t("重新预检原快照")}
                      </button>
                    )}
                    {[
                      "unknown",
                      "pending",
                      "awaiting_signature",
                      "reverted",
                      "cancelled",
                    ].includes(selected.status) && (
                      <div className="result-actions">
                        <button
                          className="outline"
                          disabled={busy}
                          onClick={() => continueQuery(selected)}
                        >
                          {t("继续查询")}
                        </button>
                        {["unknown", "reverted", "cancelled"].includes(
                          selected.status,
                        ) && (
                          <button
                            className="outline"
                            disabled={busy}
                            onClick={() => retry(selected)}
                          >
                            {t("明确重试原批次")}
                          </button>
                        )}
                      </div>
                    )}
                    {!verified && (
                      <button
                        className="plain restart-draft"
                        disabled={
                          busy ||
                          [
                            "unknown",
                            "pending",
                            "awaiting_signature",
                            "confirmed",
                          ].includes(selected.status)
                        }
                        onClick={newDraft}
                      >
                        <ArrowLeft size={15} />
                        {t("重新整理名单")}
                      </button>
                    )}
                  </>
                )}
              </section>
              <section
                className="batch-summary"
                aria-labelledby="summary-title"
              >
                <div className="summary-bar">
                  <div className="summary-total">
                    <h2 id="summary-title">{t("发放合计")}</h2>
                    <div className="total-amount">
                      {formatNative(total)}
                      <span>USDC</span>
                    </div>
                    <span className="counter">
                      {t("{count} 位收款人", { count: displayRows.length })}
                    </span>
                  </div>
                  <div className="summary-action">
                    {verified ? (
                      <div className="completed-actions">
                        <button
                          className="primary pay-button"
                          disabled={busy}
                          onClick={returnToEditor}
                        >
                          {t("发放下一批")} <ArrowRight size={17} />
                        </button>
                        <button
                          className="outline"
                          onClick={() => exportBatch(selected!)}
                        >
                          <ArrowDownToLine size={16} />
                          {t("导出发放报告")}
                        </button>
                      </div>
                    ) : selected ? (
                      <button
                        className="primary pay-button"
                        disabled={
                          busy ||
                          selected.status !== "ready" ||
                          !check ||
                          !configValid
                        }
                        onClick={send}
                      >
                        {busy ? t("正在处理…") : t("确认并在钱包中付款")}
                        <ArrowRight size={17} />
                      </button>
                    ) : !context ? (
                      <button
                        className="primary pay-button"
                        disabled={busy}
                        aria-haspopup="dialog"
                        onClick={openWalletSelector}
                      >
                        <Wallet size={17} />
                        {connectingWallet !== undefined
                          ? t("连接中…")
                          : t("连接钱包")}
                      </button>
                    ) : (
                      <button
                        className="primary pay-button"
                        disabled={busy || Boolean(disabledReason)}
                        onClick={review}
                      >
                        {t("复核奖励")} <ArrowRight size={17} />
                      </button>
                    )}
                    <p className="button-reason">
                      {verified
                        ? t("本批记录已保存，可继续整理下一批名单")
                        : selected
                          ? check
                            ? t("确认前会再次检查钱包、余额并模拟交易")
                            : t("付款快照已保存，名单已冻结")
                          : !context && configValid
                            ? t("连接后可复核名单，付款前还需你确认")
                            : t(disabledReason) ||
                              t("下一步查看完整执行名单与手续费")}
                    </p>
                  </div>
                </div>
                <details className="fee-details" open={Boolean(selected)}>
                  <summary>{t("余额与手续费")}</summary>
                  <dl>
                    <div>
                      <dt>{t("付款方式")}</dt>
                      <dd>{t("原生 USDC · 单笔交易")}</dd>
                    </div>
                    <div>
                      <dt>{t("钱包余额")}</dt>
                      <dd>
                        {balance !== undefined
                          ? `${formatNative(balance)} USDC`
                          : t("连接后查询")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("预计手续费")}</dt>
                      <dd>
                        {check
                          ? `${formatNative(check.estimatedFee)} USDC`
                          : t("预检后计算")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("保守准备额度")}</dt>
                      <dd>
                        {check
                          ? `${formatNative(check.requiredBalance)} USDC`
                          : t("奖励 + gas 上限")}
                      </dd>
                    </div>
                    {selected?.evidence && (
                      <div>
                        <dt>{t("实际手续费")}</dt>
                        <dd>
                          {formatNative(
                            BigInt(selected.evidence.gasUsed) *
                              BigInt(selected.evidence.effectiveGasPrice),
                          )}{" "}
                          USDC
                        </dd>
                      </div>
                    )}
                  </dl>
                </details>
              </section>
              <p className="payment-note">
                {t("通过钱包确认付款，无平台手续费。")}{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setTab("help");
                  }}
                >
                  {t("了解发放规则")}
                </a>
              </p>
            </div>
          </>
        )}
        {tab === "history" && (
          <section className="history-panel" aria-labelledby="history-heading">
            <div className="panel-heading history-toolbar">
              <h2 id="history-heading">
                {t("本地批次")}{" "}
                <span className="record-count">{records.length}</span>
              </h2>
              <div className="result-actions history-backup-actions">
                <button
                  className="outline"
                  onClick={() =>
                    download(
                      exportBackup(records),
                      "application/json",
                      `${SETTINGS.brand}-backup.json`,
                    )
                  }
                >
                  <ArrowDownToLine size={16} />
                  {t("备份全部记录")}
                </button>
                <label className="button outline">
                  <FileUp size={16} />
                  {t("恢复 JSON 备份")}{" "}
                  <input
                    type="file"
                    aria-label={t("恢复 JSON 备份")}
                    accept=".json,application/json"
                    onChange={(e) => {
                      importFile(e.target.files?.[0], "backup");
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <p className="muted">
              {t(
                "记录保存在当前浏览器，按网络、合约与付款钱包隔离。备份恢复后重新核验链上结果。",
              )}
            </p>
            <div className="hash-restore">
              <label htmlFor="txhash">{t("从交易哈希恢复")}</label>
              <div>
                <input
                  id="txhash"
                  value={txInput}
                  onChange={(e) => setTxInput(e.target.value)}
                  placeholder={t("完整交易哈希 0x…")}
                />
                <button
                  className="outline"
                  disabled={busy || !configValid}
                  onClick={restore}
                >
                  {t("核验交易")}
                </button>
              </div>
            </div>
            {!records.length ? (
              <div className="empty-history">
                <History size={32} />
                <h3>{t("还没有发放记录")}</h3>
                <p>{t("准备第一批奖励后，冻结快照与交易进度会保存在这里。")}</p>
                <button className="outline" onClick={() => setTab("rewards")}>
                  {t("去整理名单")}
                </button>
              </div>
            ) : (
              <div className="history-table-wrap">
                <table className="history-table" aria-label={t("本地发放记录")}>
                  <colgroup>
                    <col className="history-batch-column" />
                    <col className="history-amount-column" />
                    <col className="history-network-column" />
                    <col className="history-status-column" />
                    <col className="history-actions-column" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">{t("奖励批次")}</th>
                      <th scope="col">{t("发放金额")}</th>
                      <th scope="col">{t("网络与钱包")}</th>
                      <th scope="col">{t("状态")}</th>
                      <th scope="col" className="history-actions-heading">
                        {t("操作")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr
                        className="history-item"
                        key={recordKey(record.snapshot)}
                      >
                        <th scope="row" className="history-batch">
                          <h3 title={record.activityName || t("未命名奖励")}>
                            {record.activityName || t("未命名奖励")}
                          </h3>
                          <HistoryReference
                            label={t("批次 ID")}
                            value={record.snapshot.batchId}
                          />
                        </th>
                        <td className="history-amount">
                          <strong>
                            {formatNative(BigInt(record.snapshot.totalNative))}{" "}
                            <span>USDC</span>
                          </strong>
                          <small>
                            {t("{count} 位收款人", {
                              count: record.snapshot.recipients.length,
                            })}
                          </small>
                        </td>
                        <td className="history-network">
                          <span className="history-chain">
                            <NetworkBadge chain={chainForRecord(record)} />
                          </span>
                          <HistoryReference
                            label={t("付款钱包")}
                            value={record.snapshot.payer}
                          />
                          <HistoryReference
                            label={t("合约地址")}
                            value={record.snapshot.contractAddress}
                          />
                        </td>
                        <td className="history-status">
                          <span className={`status-pill ${record.status}`}>
                            <span className="status-dot" aria-hidden="true" />
                            {t(STATUS_LABELS[record.status])}
                          </span>
                        </td>
                        <td className="history-actions-cell">
                          <div className="history-actions">
                            <button
                              className="history-view-button"
                              disabled={busy}
                              onClick={() => {
                                setSelected(record);
                                setCheck(undefined);
                                setTab("rewards");
                              }}
                            >
                              {t("查看批次")} <ChevronRight size={14} />
                            </button>
                            <button
                              className="history-icon-button"
                              aria-label={t("继续查询")}
                              title={t("继续查询")}
                              disabled={busy}
                              onClick={() => continueQuery(record)}
                            >
                              <RotateCw size={16} />
                            </button>
                            <button
                              className="history-icon-button"
                              aria-label={t("导出 CSV")}
                              title={t("导出 CSV")}
                              onClick={() =>
                                download(
                                  exportReport(record, locale),
                                  "text/csv",
                                  `${SETTINGS.brand}-report.csv`,
                                )
                              }
                            >
                              <ArrowDownToLine size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
        {tab === "help" && (
          <section className="help-panel">
            <h2>{t("发放流程")}</h2>
            <div className="help-grid">
              {[
                [
                  t("整理"),
                  t(
                    "CSV 包含 address、amount，可选 label。金额使用普通十进制，最多 6 位小数。重复、错误地址或金额会阻止整批付款。",
                  ),
                ],
                [
                  t("复核"),
                  t(
                    "连接钱包并切换到目标 Arc 网络。逐个核对执行名单、付款人、总额和手续费。余额须覆盖奖励与 gas。",
                  ),
                ],
                [
                  t("发放"),
                  t(
                    "付款前保存原批次 ID 和冻结名单。同一付款钱包的同一 ID 最多成功一次，任何收款失败整笔回滚。失败仍可能消耗 gas。",
                  ),
                ],
                [
                  t("核验"),
                  t(
                    "查询超时不表示失败。通过原网络继续查询或输入交易哈希恢复，只有实际调用与所有事件匹配才确认已发放。",
                  ),
                ],
              ].map(([title, text], i) => (
                <article key={title}>
                  <span>{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
            <div className="atomic-notice">
              {t(
                "请始终通过应用发奖。合约拒绝直接转入；其他协议行为产生的意外余额没有管理员恢复入口。当前实现未经独立安全审计。",
              )}
            </div>
            <p className="muted">
              {t(
                "本地标签与活动名不会写入链上，请定期导出 JSON 备份。钱包切换后，已提交批次仍通过原网络查询。重试沿用原 ID，两笔交易可能都产生手续费。",
              )}
            </p>
            <a
              href="https://docs.arc.io/arc/concepts/stablecoin-native-model"
              target="_blank"
              rel="noreferrer"
            >
              {t("查看 Arc 原生 USDC 官方说明 ↗")}
            </a>
          </section>
        )}
        <footer>
          <span>{SETTINGS.brand}</span>
          <span>{t("钱包签名 · 链上发放 · 本地记录")}</span>
        </footer>
      </main>
      {walletDialogOpen && (
        <WalletDialog
          wallets={runtime.wallets}
          connectedIndex={context ? walletIndex : undefined}
          pendingIndex={connectingWallet}
          error={walletError}
          notice={runtime.walletNotice}
          onSelect={(index) => void connectWallet(index)}
          onClose={() => setWalletDialogOpen(false)}
        />
      )}
    </div>
  );
}
function chainForRecord(record: BatchRecord) {
  const chain = Object.values(NETWORKS).find(
    (c) => c.id === record.snapshot.chainId,
  );
  if (!chain) throw new Error("记录使用不支持的网络");
  return chain;
}
function PaymentOverview({ record }: { record: BatchRecord }) {
  const { t } = useI18n();
  const { snapshot } = record;
  const chain = chainForRecord(record);
  return (
    <>
      <div className="review-overview" role="group" aria-label={t("付款概览")}>
        <div className="review-total">
          <span>{t("发放合计")}</span>
          <strong>
            {formatNative(BigInt(snapshot.totalNative))} <span>USDC</span>
          </strong>
          <span>
            {t("{count} 位收款人", { count: snapshot.recipients.length })}
          </span>
        </div>
        <dl className="review-account">
          <div>
            <dt>{t("发放网络")}</dt>
            <dd>
              <NetworkBadge chain={chain} />
            </dd>
          </div>
          <div>
            <dt>{t("付款钱包")}</dt>
            <dd>
              <AddressValue value={snapshot.payer} />
            </dd>
          </div>
        </dl>
      </div>
      <details className="transaction-details">
        <summary>{t("交易详情")}</summary>
        <div className="review-context">
          <span>{t("发奖合约")}</span>
          <a
            href={`${chain.blockExplorers.default.url}/address/${snapshot.contractAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            {snapshot.contractAddress}
          </a>
          <span>{t("批次 ID")}</span>
          <code>{snapshot.batchId}</code>
        </div>
      </details>
    </>
  );
}
function ReviewRoster({ record }: { record: BatchRecord }) {
  const { t } = useI18n();
  // Keep display ordering separate from the frozen execution list, calldata, and payload hash.
  const rows = [...record.snapshot.recipients].sort(
    (a, b) => a.sourceRow - b.sourceRow,
  );
  const status =
    record.status === "confirmed" && !record.evidence
      ? "unknown"
      : record.status;
  return (
    <div className="roster-table review-roster">
      <table>
        <caption className="sr-only">{t("收款名单")}</caption>
        <colgroup>
          <col className="roster-index-column" />
          <col />
          <col className="roster-amount-column" />
          <col className="roster-label-column" />
          <col className="roster-status-column" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="roster-index">
              <span aria-hidden="true">#</span>
              <span className="sr-only">{t("序号")}</span>
            </th>
            <th scope="col">{t("收款地址")}</th>
            <th scope="col" className="roster-amount">
              {t("金额 / USDC")}
            </th>
            <th scope="col">{t("标签")}</th>
            <th scope="col">{t("状态")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="table-row" key={row.address}>
              <th scope="row" className="roster-index">
                {row.sourceRow}
              </th>
              <td className="roster-address">
                <span className="roster-field-label" aria-hidden="true">
                  {t("收款地址")}
                </span>
                <AddressValue value={row.address} />
              </td>
              <td className="roster-amount">
                <span className="roster-field-label" aria-hidden="true">
                  {t("金额 / USDC")}
                </span>
                <span className="roster-readonly-value">{row.amount}</span>
              </td>
              <td className="roster-label">
                <span className="roster-field-label" aria-hidden="true">
                  {t("标签")}
                </span>
                <span className="roster-readonly-value">
                  {row.label || "—"}
                </span>
              </td>
              <td className="roster-status">
                <span className="roster-field-label" aria-hidden="true">
                  {t("状态")}
                </span>
                <span className={`status-pill ${status}`}>
                  {t(RECIPIENT_STATUS_LABELS[status])}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PaymentAttempts({ record }: { record: BatchRecord }) {
  const { t } = useI18n();
  const latest = record.attempts.at(-1);
  const transactionHash =
    record.evidence?.transactionHash ?? latest?.currentHash;
  const hasHistory =
    record.attempts.length > 1 ||
    (record.status === "confirmed" && Boolean(latest?.error));
  return (
    <>
      {transactionHash && (
        <div className="attempt">
          <a
            href={`${chainForRecord(record).blockExplorers.default.url}/tx/${transactionHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("查看交易 {hash} ↗", { hash: abbreviate(transactionHash) })}
          </a>
        </div>
      )}
      {record.status !== "confirmed" && latest?.error && (
        <p className="attempt-message">
          {t(errorMessage(new Error(latest.error), latest.errorClass))}
        </p>
      )}
      {record.status !== "confirmed" &&
        latest?.replacements.map((replacement, i) => (
          <small className="attempt-message" key={i}>
            {t("替换原因 {reason}：{oldHash} → {newHash}", {
              reason: replacement.reason,
              oldHash: abbreviate(replacement.oldHash),
              newHash: abbreviate(replacement.newHash),
            })}
          </small>
        ))}
      {hasHistory && (
        <details className="attempt-history">
          <summary>
            {t("付款尝试记录（{count} 次）", { count: record.attempts.length })}
          </summary>
          <p className="muted">
            {t("每次钱包请求独立记录，批次结果以上方核验状态为准。")}
          </p>
          {record.attempts.map((attempt, index) => (
            <div className="attempt" key={attempt.id}>
              <strong>{t("第 {count} 次尝试", { count: index + 1 })}</strong>
              {attempt.error && (
                <small>
                  {t(
                    errorMessage(new Error(attempt.error), attempt.errorClass),
                  )}
                </small>
              )}
              {attempt.currentHash && (
                <a
                  href={`${chainForRecord(record).blockExplorers.default.url}/tx/${attempt.currentHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("查看此次交易 {hash} ↗", {
                    hash: abbreviate(attempt.currentHash),
                  })}
                </a>
              )}
              {attempt.replacements.map((replacement, i) => (
                <small key={i}>
                  {t("替换原因 {reason}：{oldHash} → {newHash}", {
                    reason: replacement.reason,
                    oldHash: abbreviate(replacement.oldHash),
                    newHash: abbreviate(replacement.newHash),
                  })}
                </small>
              ))}
            </div>
          ))}
        </details>
      )}
    </>
  );
}
function AddressValue({ value }: { value: string }) {
  return (
    <span className="address-value">
      <code>{value}</code>
      <CopyButton value={value} />
    </span>
  );
}
function HistoryReference({ label, value }: { label: string; value: string }) {
  return (
    <span className="history-reference">
      <span className="history-reference-label">{label}</span>
      <code title={value}>{abbreviate(value)}</code>
      <CopyButton value={value} label={label} />
    </span>
  );
}
