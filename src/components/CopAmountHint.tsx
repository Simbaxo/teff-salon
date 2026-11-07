type CopAmountHintProps = {
  value: string;
};

const formatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default function CopAmountHint({ value }: CopAmountHintProps) {
  const amount = Number(value);

  if (
    value.trim() === "" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 2147483647
  ) {
    return null;
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="mt-2 text-sm font-semibold text-emerald-700"
    >
      {formatter.format(amount)}
    </p>
  );
}
