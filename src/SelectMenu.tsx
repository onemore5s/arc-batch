import { useI18n } from "./i18n";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { SETTINGS } from "./config";

interface SelectOption {
  value: string;
  label: string;
  content?: ReactNode;
}

interface SelectMenuProps {
  label: string;
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  onChange(value: string): void;
}

export function SelectMenu({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: SelectMenuProps) {
  const { t } = useI18n();
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const query = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const activeIndex = Math.max(0, Math.min(active, options.length - 1));
  const blocked = disabled || options.length === 0;
  const expanded = open && !blocked;

  useEffect(() => {
    if (blocked) setOpen(false);
  }, [blocked]);

  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current!.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [expanded]);

  useEffect(() => {
    if (expanded)
      menu.current!.children[activeIndex].scrollIntoView({ block: "nearest" });
  }, [expanded, activeIndex]);

  const reveal = (index: number) => {
    query.current = { text: "", at: 0 };
    setActive(index);
    setOpen(true);
  };
  const choose = (index: number) => {
    if (options[index].value !== value) onChange(options[index].value);
    setOpen(false);
    trigger.current!.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (blocked) return;
    const current = expanded ? activeIndex : selectedIndex;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (!expanded) reveal(selectedIndex);
        else
          setActive(
            (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
              options.length,
          );
        break;
      case "Home":
      case "End":
        event.preventDefault();
        reveal(event.key === "Home" ? 0 : options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (expanded) choose(activeIndex);
        else reveal(selectedIndex);
        break;
      case "Escape":
        if (expanded) event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default: {
        if (
          event.key.length !== 1 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        const at = Date.now();
        const previous =
          at - query.current.at < SETTINGS.selectTypeaheadMs
            ? query.current.text
            : "";
        const character = event.key.toLocaleLowerCase();
        const text = previous === character ? character : previous + character;
        query.current = { text, at };
        const start = text.length === 1 ? current + 1 : current;
        const offset = options.findIndex((_, index) =>
          options[(start + index) % options.length].label
            .toLocaleLowerCase()
            .startsWith(text),
        );
        if (!expanded) setActive(selectedIndex);
        if (offset >= 0) setActive((start + offset) % options.length);
        setOpen(true);
      }
    }
  };

  return (
    <div className="select-menu" ref={root}>
      <button
        type="button"
        role="combobox"
        className="select-trigger"
        ref={trigger}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={
          expanded ? `${listId}-${activeIndex}` : undefined
        }
        disabled={blocked}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onClick={() => (expanded ? setOpen(false) : reveal(selectedIndex))}
      >
        <span>
          {options[selectedIndex]?.content ??
            options[selectedIndex]?.label ??
            t("暂无选项")}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {expanded && (
        <div
          id={listId}
          role="listbox"
          aria-label={t("{label}选项", { label })}
          className="select-options"
          ref={menu}
          onPointerDown={(event) => event.preventDefault()}
        >
          {options.map((option, index) => (
            <div
              id={`${listId}-${index}`}
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              data-active={index === activeIndex}
              className="select-option"
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span>{option.content ?? option.label}</span>
              {option.value === value && <Check size={15} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
