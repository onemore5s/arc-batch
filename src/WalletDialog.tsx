import { useI18n } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search, Wallet, X } from "lucide-react";
import type { ConnectedWallet } from "./chain/adapters";
import { WALLET_UI } from "./config";

type WalletOption = Pick<ConnectedWallet, "name" | "icon">;
interface WalletDialogProps {
  wallets: WalletOption[];
  connectedIndex?: number;
  pendingIndex?: number;
  error: string;
  notice?: string;
  onSelect(index: number): void;
  onClose(): void;
}

function WalletIcon({ name, icon }: WalletOption) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  return (
    <span className="wallet-option-icon">
      {!failed && icon?.startsWith(WALLET_UI.iconDataPrefix) ? (
        <img
          src={icon}
          alt={t("{name} 图标", { name })}
          onError={() => setFailed(true)}
        />
      ) : (
        <Wallet size={24} aria-hidden="true" />
      )}
    </span>
  );
}

export function WalletDialog({
  wallets,
  connectedIndex,
  pendingIndex,
  error,
  notice,
  onSelect,
  onClose,
}: WalletDialogProps) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const backdropPress = useRef(false);
  const [query, setQuery] = useState("");
  const options = wallets.map((wallet) => ({
    ...wallet,
    name: wallet.name === WALLET_UI.fallbackName ? t(wallet.name) : wallet.name,
  }));
  const matches = options
    .map((wallet, index) => ({ wallet, index }))
    .filter(({ wallet }) =>
      wallet.name
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
    );
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    // Focus the heading initially to avoid opening the mobile keyboard.
    heading.current!.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="wallet-dialog"
      aria-labelledby="wallet-dialog-title"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled)",
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (
          event.shiftKey &&
          (event.target === first || event.target === heading.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && event.target === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget)
          onClose();
      }}
    >
      <div className="wallet-dialog-content">
        <div className="wallet-dialog-header">
          <h2 id="wallet-dialog-title" ref={heading} tabIndex={-1}>
            {t("连接钱包")}
          </h2>
          <button
            type="button"
            className="wallet-dialog-close"
            aria-label={t("关闭钱包选择")}
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {wallets.length > 0 && (
          <div className="wallet-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={search}
              type="search"
              aria-label={t("搜索钱包")}
              placeholder={t("搜索钱包…")}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label={t("清除搜索")}
                onClick={() => {
                  setQuery("");
                  search.current!.focus();
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <div className="wallet-dialog-list">
          {matches.length ? (
            <ul aria-label={t("可用钱包")}>
              {matches.map(({ wallet, index }) => (
                <li key={index}>
                  <button
                    type="button"
                    className="wallet-option"
                    aria-label={wallet.name}
                    disabled={pendingIndex !== undefined}
                    onClick={() => onSelect(index)}
                  >
                    <WalletIcon {...wallet} />
                    <span className="wallet-option-name">{wallet.name}</span>
                    <span
                      className={`wallet-option-badge${connectedIndex === index ? " is-connected" : ""}`}
                    >
                      {pendingIndex === index ? (
                        <>
                          <LoaderCircle
                            size={12}
                            className="wallet-spinner"
                            aria-hidden="true"
                          />
                          {t("连接中")}
                        </>
                      ) : (
                        <>
                          <span className="wallet-status-dot" />
                          {connectedIndex === index ? t("已连接") : t("已安装")}
                        </>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="wallet-empty" role="status">
              {wallets.length ? (
                <Search size={28} aria-hidden="true" />
              ) : (
                <Wallet size={32} aria-hidden="true" />
              )}
              <h3>
                {wallets.length ? t("未找到匹配的钱包") : t("尚未检测到钱包")}
              </h3>
              <p>
                {wallets.length
                  ? t("试试其他名称，或清除搜索查看全部钱包。")
                  : t(
                      "请安装或启用钱包扩展后刷新页面，也可在钱包内置浏览器中打开。",
                    )}
              </p>
            </div>
          )}
        </div>
        {pendingIndex !== undefined && (
          <p className="wallet-connection-status" role="status">
            {t("请在 {name} 中确认连接…", {
              name: options[pendingIndex].name,
            })}
          </p>
        )}
        {error && (
          <p className="wallet-connection-error" role="alert">
            {t(error)}
          </p>
        )}
        <div className="wallet-dialog-footer">
          {t(notice ?? "选择钱包后，在钱包中确认连接")}
        </div>
      </div>
    </dialog>
  );
}
