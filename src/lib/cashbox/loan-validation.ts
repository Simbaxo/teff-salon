type LoanInput = {
  employeeId: number;
  amount: number;
  description: string;
  idempotencyKey: string;
};

type LoanValidationResult =
  | {
      success: true;
      data: LoanInput;
    }
  | {
      success: false;
      error: string;
    };

export function validateCashboxLoan(input: unknown): LoanValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      success: false,
      error: "Datos del préstamo inválidos.",
    };
  }

  const data = input as Record<string, unknown>;

  const { employeeId, amount, idempotencyKey } = data;

  const description =
    typeof data.description === "string" ? data.description.trim() : "";

  if (
    typeof employeeId !== "number" ||
    !Number.isSafeInteger(employeeId) ||
    employeeId <= 0
  ) {
    return {
      success: false,
      error: "Selecciona una técnica válida.",
    };
  }

  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 2147483647
  ) {
    return {
      success: false,
      error: "El valor del préstamo es inválido.",
    };
  }

  if (description.length > 300) {
    return {
      success: false,
      error: "La descripción es demasiado larga.",
    };
  }

  if (
    typeof idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idempotencyKey,
    )
  ) {
    return {
      success: false,
      error: "Referencia de operación inválida.",
    };
  }

  return {
    success: true,
    data: {
      employeeId,
      amount,
      description,
      idempotencyKey,
    },
  };
}
