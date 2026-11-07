import React, { FC, useEffect, useRef, useState } from "react";
import {
  parseNumericInput,
  type NumericInputMode,
} from "../model/numericInput";
import type { Scope } from "../model/expression";

export interface NumberInputProps {
  initialValue?: number | undefined;
  /** Raw expression to preserve when reopening an editor. */
  initialText?: string | undefined;
  externalValue?: number | undefined;
  validate?: ((v: number) => boolean) | undefined;
  onSubmit: (value: number, expression: string) => void;
  onCancel: () => void;
  /** Named values available to expressions. */
  scope?: Scope | undefined;
  onChange?: ((value: number) => void) | undefined;
  /** Unit family the surrounding feature expects. Defaults to length. */
  expressionMode?: NumericInputMode | undefined;
  showConfirmButton?: boolean | undefined;
  confirmLabel?: string | undefined;
  confirmButtonClassName?: string | undefined;
  tabCancels?: boolean | undefined;
  enableArrowNudge?: boolean | undefined;
  arrowMinimum?: number | undefined;
  inputClassName?: string | undefined;
  className?: string | undefined;
  autoFocus?: boolean | undefined;
}

const DEFAULT_INPUT_CLASS =
  "w-20 px-2 py-1 text-sm bg-gray-700 text-white rounded border border-gray-600 " +
  "focus:border-blue-500 focus:outline-none";

const DEFAULT_CONFIRM_CLASS =
  "px-2 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded";

export const NumberInput: FC<NumberInputProps> = ({
  initialValue,
  initialText,
  externalValue,
  validate = (v) => v > 0,
  onSubmit,
  onCancel,
  onChange,
  scope = {},
  expressionMode = "length",
  showConfirmButton,
  confirmLabel = "OK",
  confirmButtonClassName = DEFAULT_CONFIRM_CLASS,
  tabCancels = false,
  enableArrowNudge = true,
  arrowMinimum = 0.01,
  inputClassName = DEFAULT_INPUT_CLASS,
  className = "flex items-center gap-2",
  autoFocus = true,
}) => {
  const [text, setText] = useState<string>(
    initialText ?? initialValue?.toFixed(2) ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autoFocus]);

  useEffect(() => {
    setText(initialText ?? initialValue?.toFixed(2) ?? "");
    setError(null);
  }, [initialValue, initialText]);

  useEffect(() => {
    if (externalValue !== undefined) {
      setText(externalValue.toFixed(2));
      setError(null);
    }
  }, [externalValue]);

  const trySubmit = () => {
    const parsed = parseNumericInput(text, expressionMode, scope);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (!validate(parsed.value)) {
      setError("Value is out of range.");
      return;
    }
    setError(null);
    onSubmit(parsed.value, text.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      trySubmit();
    } else if (e.key === "Escape" || (tabCancels && e.key === "Tab")) {
      e.preventDefault();
      onCancel();
    } else if (
      enableArrowNudge &&
      (e.key === "ArrowUp" || e.key === "ArrowDown")
    ) {
      e.preventDefault();
      const parsed = parseNumericInput(text, expressionMode, scope);
      const current = parsed.ok ? parsed.value : 0;
      const step = e.shiftKey ? 0.1 : 1;
      const next =
        e.key === "ArrowUp"
          ? current + step
          : Math.max(arrowMinimum, current - step);
      const rounded = parseFloat(next.toFixed(2));
      setText(String(rounded));
      setError(null);
      if (onChange && validate(rounded)) onChange(rounded);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setText(value);
    if (!onChange) return;
    const parsed = parseNumericInput(value, expressionMode, scope);
    if (!parsed.ok) return;
    setError(null);
    if (validate(parsed.value)) onChange(parsed.value);
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={inputClassName}
        placeholder="Value"
        aria-invalid={error ? true : undefined}
        title={error ?? undefined}
      />
      {showConfirmButton && (
        <button
          onClick={trySubmit}
          aria-label={confirmLabel}
          className={confirmButtonClassName}
        >
          {confirmLabel}
        </button>
      )}
      {error && (
        <span className="max-w-64 text-[10px] leading-tight text-red-400">
          {error}
        </span>
      )}
    </div>
  );
};
