"use client";

import { useEffect, useRef, useState } from "react";

type MoneyInputProps = {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  "aria-label"?: string;
};

export default function MoneyInput({
  value,
  onChange,
  className,
  min = 0,
  max,
  step = 1,
  placeholder,
  "aria-label": ariaLabel,
}: MoneyInputProps) {
  const [draft, setDraft] = useState(String(value));
  const isFocusedRef = useRef(false);

  // Synchronize external changes only when not editing.
  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(String(value));
    }
  }, [value]);

  function handleChange(raw: string) {
    setDraft(raw);

    // An empty field is allowed while editing.
    // Financial calculations continue using zero.
    if (raw === "") {
      onChange(0);
      return;
    }

    const parsed = Number(raw);

    if (
      Number.isFinite(parsed) &&
      parsed >= min &&
      (max === undefined || parsed <= max)
    ) {
      onChange(parsed);
    }
  }

  function handleBlur() {
    isFocusedRef.current = false;

    const parsed = draft.trim() === "" ? 0 : Number(draft);

    const normalized =
      Number.isFinite(parsed) &&
      parsed >= min &&
      (max === undefined || parsed <= max)
        ? parsed
        : value;

    setDraft(String(normalized));

    if (normalized !== value) {
      onChange(normalized);
    }
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
      onFocus={(event) => {
        isFocusedRef.current = true;

        if (event.currentTarget.value === "0") {
          event.currentTarget.select();
        }
      }}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={handleBlur}
    />
  );
}
