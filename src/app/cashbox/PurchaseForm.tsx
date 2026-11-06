"use client";

import { useEffect, useRef, useState } from "react";

type PurchaseMode = "NEW_CASH" | "EXISTING_CASH" | "NON_CASH";
type PaymentMethod = "CASH" | "BOLD" | "TRANSFER" | "OTHER";

type ExpenseCategory = {
  id: number;
  name: string;
};

type CategoriesResponse = {
  categories: ExpenseCategory[];
};

type PurchaseRequest = {
  mode: PurchaseMode;
  categoryId: number;
  amount: number;
  description: string;
  supplier: string;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  existingCashMovementId?: number;
};

type ReceiptIntent = {
  idempotencyKey: string;
  contentSha256: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

type PendingPurchase = {
  request: PurchaseRequest;
  expenseId: number | null;
  cashMovementId: number | null;
  receiptIntent?: ReceiptIntent;
};

const PENDING_PURCHASE_STORAGE_KEY = "teff-cashbox-pending-purchase-v1";

function isValidPendingPurchase(value: unknown): value is PendingPurchase {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const pending = value as Record<string, unknown>;
  const request = pending.request;

  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return false;
  }

  const data = request as Record<string, unknown>;
  const receiptIntent = pending.receiptIntent;
  const validReceiptIntent =
    receiptIntent === undefined ||
    (receiptIntent !== null &&
      typeof receiptIntent === "object" &&
      !Array.isArray(receiptIntent) &&
      typeof (receiptIntent as ReceiptIntent).idempotencyKey === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        (receiptIntent as ReceiptIntent).idempotencyKey,
      ) &&
      typeof (receiptIntent as ReceiptIntent).contentSha256 === "string" &&
      /^[0-9a-f]{64}$/i.test((receiptIntent as ReceiptIntent).contentSha256) &&
      typeof (receiptIntent as ReceiptIntent).originalName === "string" &&
      (receiptIntent as ReceiptIntent).originalName.length > 0 &&
      (receiptIntent as ReceiptIntent).originalName.length <= 255 &&
      typeof (receiptIntent as ReceiptIntent).mimeType === "string" &&
      Number.isSafeInteger((receiptIntent as ReceiptIntent).sizeBytes) &&
      (receiptIntent as ReceiptIntent).sizeBytes > 0);

  const validMode =
    data.mode === "NEW_CASH" ||
    data.mode === "EXISTING_CASH" ||
    data.mode === "NON_CASH";

  const validMethod =
    data.paymentMethod === "CASH" ||
    data.paymentMethod === "BOLD" ||
    data.paymentMethod === "TRANSFER" ||
    data.paymentMethod === "OTHER";

  const validDate =
    typeof data.expenseDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(data.expenseDate) &&
    !Number.isNaN(new Date(`${data.expenseDate}T00:00:00.000Z`).getTime()) &&
    new Date(`${data.expenseDate}T00:00:00.000Z`).toISOString().slice(0, 10) ===
      data.expenseDate;

  const validExistingMovement =
    data.mode === "EXISTING_CASH"
      ? typeof data.existingCashMovementId === "number" &&
        Number.isSafeInteger(data.existingCashMovementId) &&
        data.existingCashMovementId > 0
      : data.existingCashMovementId === undefined;

  const validPaymentCombination =
    data.mode === "NON_CASH"
      ? data.paymentMethod !== "CASH"
      : data.paymentMethod === "CASH";

  return (
    validMode &&
    validMethod &&
    validReceiptIntent &&
    validDate &&
    validExistingMovement &&
    validPaymentCombination &&
    typeof data.categoryId === "number" &&
    Number.isSafeInteger(data.categoryId) &&
    data.categoryId > 0 &&
    typeof data.amount === "number" &&
    Number.isSafeInteger(data.amount) &&
    data.amount > 0 &&
    data.amount <= 2147483647 &&
    typeof data.description === "string" &&
    data.description.length >= 2 &&
    data.description.length <= 300 &&
    data.description.trim() === data.description &&
    typeof data.supplier === "string" &&
    data.supplier.length <= 150 &&
    data.supplier.trim() === data.supplier &&
    typeof data.idempotencyKey === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      data.idempotencyKey,
    ) &&
    (pending.expenseId === null ||
      (typeof pending.expenseId === "number" &&
        Number.isSafeInteger(pending.expenseId) &&
        pending.expenseId > 0)) &&
    (pending.cashMovementId === null ||
      (typeof pending.cashMovementId === "number" &&
        Number.isSafeInteger(pending.cashMovementId) &&
        pending.cashMovementId > 0)) &&
    (pending.expenseId === null || pending.expenseId > 0)
  );
}

function readPendingPurchase(): PendingPurchase | null {
  const stored = sessionStorage.getItem(PENDING_PURCHASE_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return isValidPendingPurchase(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function savePendingPurchase(purchase: PendingPurchase): void {
  sessionStorage.setItem(
    PENDING_PURCHASE_STORAGE_KEY,
    JSON.stringify(purchase),
  );
}

function clearPendingPurchase(): void {
  sessionStorage.removeItem(PENDING_PURCHASE_STORAGE_KEY);
}

const paymentOptions: {
  value: PaymentMethod;
  label: string;
}[] = [
  { value: "CASH", label: "Efectivo de Caja" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "BOLD", label: "Tarjeta / Bold" },
  { value: "OTHER", label: "Otro medio" },
];

function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function bogotaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

type PurchaseFormProps = {
  onPurchaseRecorded?: () => void;
};

export default function PurchaseForm({
  onPurchaseRecorded,
}: PurchaseFormProps) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");

  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(bogotaToday);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>("NEW_CASH");
  const [existingCashMovementId, setExistingCashMovementId] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [receiptUploaded, setReceiptUploaded] = useState(false);
  const [receiptInputKey, setReceiptInputKey] = useState(0);
  const receiptUploadLockRef = useRef(false);
  const submissionLockRef = useRef(false);

  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [pendingPurchase, setPendingPurchase] =
    useState<PendingPurchase | null>(null);
  const [recoveryError, setRecoveryError] = useState("");
  const pendingPurchaseRef = useRef<PendingPurchase | null>(null);

  const hasPendingPurchase = pendingPurchase !== null;
  const purchaseConfirmed =
    pendingPurchase !== null && pendingPurchase.expenseId !== null;

  useEffect(() => {
    let cancelled = false;

    function restorePurchase() {
      let recovered: PendingPurchase | null = null;
      let error = "";

      try {
        const stored = sessionStorage.getItem(PENDING_PURCHASE_STORAGE_KEY);

        if (stored !== null) {
          recovered = readPendingPurchase();

          if (!recovered) {
            error =
              "Hay una compra pendiente que no se pudo validar. Solicita revisión antes de registrar otra compra.";
          }
        }
      } catch {
        error =
          "No se pudo comprobar si hay compras pendientes. No registres nuevas compras hasta revisar el navegador.";
      }

      if (cancelled) {
        return;
      }

      if (recovered) {
        pendingPurchaseRef.current = recovered;

        const request = recovered.request;

        setCategoryId(String(request.categoryId));
        setDescription(request.description);
        setSupplier(request.supplier);
        setAmount(String(request.amount));
        setExpenseDate(request.expenseDate);
        setPaymentMethod(request.paymentMethod);
        setPurchaseMode(request.mode);
        setExistingCashMovementId(
          request.existingCashMovementId === undefined
            ? ""
            : String(request.existingCashMovementId),
        );

        setPendingPurchase(recovered);

        setRecoveryError(
          recovered.expenseId !== null
            ? `La compra #${recovered.expenseId} ya fue registrada. Continúa con el comprobante pendiente.`
            : "Se recuperó una compra pendiente. Verifica su resultado antes de reintentar.",
        );
      } else if (error) {
        setRecoveryError(error);
      }

      setRecoveryChecked(true);
    }

    void Promise.resolve().then(restorePurchase);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch("/api/expenses/categories", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("No se pudieron cargar las categorías.");
        }

        const data: CategoriesResponse = await response.json();

        if (!Array.isArray(data.categories)) {
          throw new Error("La respuesta de categorías no es válida.");
        }

        if (!controller.signal.aborted) {
          setCategories(data.categories);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setCategoriesError(
            error instanceof Error
              ? error.message
              : "Error consultando categorías.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setCategoriesLoading(false);
        }
      }
    }

    void loadCategories();

    return () => controller.abort();
  }, []);

  const parsedAmount = Number(amount);
  const validAmount =
    amount.trim() !== "" &&
    Number.isSafeInteger(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= 2147483647;

  function changePaymentMethod(value: PaymentMethod) {
    setPaymentMethod(value);
    setPurchaseMode(value === "CASH" ? "NEW_CASH" : "NON_CASH");
    setExistingCashMovementId("");
  }

  function validatePurchase() {
    setFormError("");

    const selectedCategory = Number(categoryId);
    const trimmedDescription = description.trim();
    const existingId = Number(existingCashMovementId);

    if (
      !Number.isSafeInteger(selectedCategory) ||
      selectedCategory <= 0 ||
      !categories.some((category) => category.id === selectedCategory)
    ) {
      setFormError("Selecciona una categoría válida.");
      return;
    }

    if (!validAmount) {
      setFormError("Ingresa un valor válido en pesos colombianos.");
      return;
    }

    if (trimmedDescription.length < 2 || trimmedDescription.length > 300) {
      setFormError("La descripción debe tener entre 2 y 300 caracteres.");
      return;
    }

    if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      setFormError("Selecciona una fecha válida.");
      return;
    }

    if (
      purchaseMode === "EXISTING_CASH" &&
      (!existingCashMovementId.trim() ||
        !Number.isSafeInteger(existingId) ||
        existingId <= 0)
    ) {
      setFormError("Ingresa un número válido de movimiento de Caja.");
      return;
    }

    if (!recoveryChecked || hasPendingPurchase || recoveryError) {
      setFormError("Existe una operación pendiente que requiere revisión.");
      return;
    }

    if (!buildPurchaseRequest()) {
      setFormError("Revisa los datos de la compra antes de continuar.");
      return;
    }

    setShowConfirmation(true);
  }

  function handleReceiptSelection(event: React.ChangeEvent<HTMLInputElement>) {
    setReceiptError("");

    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setReceiptFile(null);
      return;
    }

    const maxImageBytes = 5 * 1024 * 1024;
    const maxPdfBytes = 10 * 1024 * 1024;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.type)) {
      setReceiptFile(null);
      setReceiptError("Selecciona una imagen JPG, PNG, WebP o un archivo PDF.");
      event.target.value = "";
      return;
    }

    const maxBytes =
      file.type === "application/pdf" ? maxPdfBytes : maxImageBytes;

    if (file.size === 0 || file.size > maxBytes) {
      setReceiptFile(null);
      setReceiptError(
        "La imagen debe pesar máximo 5 MB y el PDF máximo 10 MB.",
      );
      event.target.value = "";
      return;
    }

    if (file.name.length > 255) {
      setReceiptFile(null);
      setReceiptError("El nombre del archivo es demasiado largo.");
      event.target.value = "";
      return;
    }

    setReceiptFile(file);
  }

  function buildPurchaseRequest(): PurchaseRequest | null {
    const selectedCategory = Number(categoryId);
    const trimmedDescription = description.trim();
    const trimmedSupplier = supplier.trim();
    const parsedExistingId = Number(existingCashMovementId);

    const parsedDate = new Date(`${expenseDate}T00:00:00.000Z`);

    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(expenseDate) &&
      !Number.isNaN(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === expenseDate;

    if (
      !Number.isSafeInteger(selectedCategory) ||
      selectedCategory <= 0 ||
      !categories.some((category) => category.id === selectedCategory) ||
      !validAmount ||
      trimmedDescription.length < 2 ||
      trimmedDescription.length > 300 ||
      trimmedSupplier.length > 150 ||
      !validDate ||
      (purchaseMode === "EXISTING_CASH" &&
        (!existingCashMovementId.trim() ||
          !Number.isSafeInteger(parsedExistingId) ||
          parsedExistingId <= 0)) ||
      (purchaseMode === "NON_CASH" && paymentMethod === "CASH") ||
      (purchaseMode !== "NON_CASH" && paymentMethod !== "CASH")
    ) {
      return null;
    }

    const request: PurchaseRequest = {
      mode: purchaseMode,
      categoryId: selectedCategory,
      amount: parsedAmount,
      description: trimmedDescription,
      supplier: trimmedSupplier,
      expenseDate,
      paymentMethod,
      idempotencyKey: crypto.randomUUID(),
    };

    if (purchaseMode === "EXISTING_CASH") {
      request.existingCashMovementId = parsedExistingId;
    }

    return request;
  }

  async function submitPurchase() {
    if (submissionLockRef.current || isSaving || !recoveryChecked) {
      return;
    }

    if (recoveryError && !pendingPurchaseRef.current) {
      setFormError(
        "Hay una compra pendiente que requiere revisión. No se enviaron datos.",
      );
      return;
    }

    const existing = pendingPurchaseRef.current;

    if (existing?.expenseId !== null && existing?.expenseId !== undefined) {
      setFormError(
        "Esta compra ya fue registrada. Continúa con el comprobante.",
      );
      return;
    }

    if (!existing && (!showConfirmation || hasPendingPurchase)) {
      setFormError("Primero revisa y confirma los datos de la compra.");
      return;
    }

    const newRequest = existing ? null : buildPurchaseRequest();

    if (!existing && !newRequest) {
      setFormError("Los datos de la compra no son válidos.");
      return;
    }

    const pending: PendingPurchase = existing ?? {
      request: newRequest!,
      expenseId: null,
      cashMovementId: null,
    };

    // Save the exact request before contacting the server.
    try {
      const stored = sessionStorage.getItem(PENDING_PURCHASE_STORAGE_KEY);

      if (stored !== null) {
        const recovered = readPendingPurchase();

        if (
          !recovered ||
          recovered.request.idempotencyKey !== pending.request.idempotencyKey
        ) {
          setFormError("Existe otra compra pendiente que requiere revisión.");
          return;
        }
      }

      savePendingPurchase(pending);
    } catch {
      setFormError(
        "No se pudo guardar la referencia de seguridad. La compra no fue enviada.",
      );
      return;
    }

    pendingPurchaseRef.current = pending;
    setPendingPurchase(pending);
    submissionLockRef.current = true;
    setIsSaving(true);
    setFormError("");

    try {
      const response = await fetch("/api/cashbox/purchases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(pending.request),
      });

      const result: {
        success?: boolean;
        duplicate?: boolean;
        expenseId?: number;
        cashMovementId?: number | null;
        error?: string;
      } = await response.json();

      if (!response.ok || result.success !== true) {
        // Only these explicit business rejections are definitive.
        // Unknown errors, transaction conflicts, and network failures
        // must preserve the original purchase reference.
        const definitiveErrors = new Set([
          "Solicitud inválida.",
          "Datos de compra inválidos.",
          "La categoría no está disponible.",
          "Usuario no autorizado.",
          "La caja todavía no está activada.",
          "Saldo de caja insuficiente.",
          "El movimiento no está disponible para vincular.",
        ]);

        const confirmedRejection =
          [400, 403, 409].includes(response.status) &&
          typeof result.error === "string" &&
          definitiveErrors.has(result.error);

        if (confirmedRejection) {
          try {
            clearPendingPurchase();
            pendingPurchaseRef.current = null;
            setPendingPurchase(null);
            setShowConfirmation(false);
          } catch {
            throw new Error(
              "La compra fue rechazada, pero no se pudo liberar su referencia. Verifica el estado antes de intentar otra compra.",
            );
          }
        }

        throw new Error(
          result.error ??
            "No se pudo confirmar la compra. Reintenta con la misma referencia.",
        );
      }

      if (
        !Number.isSafeInteger(result.expenseId) ||
        (pending.request.mode !== "NON_CASH" &&
          !Number.isSafeInteger(result.cashMovementId)) ||
        (pending.request.mode === "NON_CASH" && result.cashMovementId !== null)
      ) {
        throw new Error(
          "La respuesta no permitió confirmar la compra. Conserva la referencia original.",
        );
      }

      const confirmed: PendingPurchase = {
        request: pending.request,
        expenseId: result.expenseId!,
        cashMovementId: result.cashMovementId ?? null,
      };

      // Preserve the confirmed expense ID for receipt upload.
      savePendingPurchase(confirmed);

      pendingPurchaseRef.current = confirmed;
      setPendingPurchase(confirmed);
      setShowConfirmation(false);
      setFormError("");

      // Refresh Caja after the server confirms the purchase.
      onPurchaseRecorded?.();

      // The purchase is confirmed, but its receipt may still be pending.
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No se pudo confirmar la compra. Reintenta con la misma referencia.",
      );
    } finally {
      submissionLockRef.current = false;
      setIsSaving(false);
    }
  }

  async function uploadReceipt() {
    if (receiptUploadLockRef.current || isUploadingReceipt) {
      return;
    }

    const confirmed = pendingPurchaseRef.current;

    if (
      !confirmed ||
      !Number.isSafeInteger(confirmed.expenseId) ||
      confirmed.expenseId === null ||
      confirmed.expenseId <= 0
    ) {
      setReceiptError("Primero debes confirmar el registro de la compra.");
      return;
    }

    if (!receiptFile) {
      setReceiptError("Selecciona un comprobante para adjuntar.");
      return;
    }

    if (receiptUploaded) {
      setReceiptError(
        "El comprobante ya fue adjuntado. No lo envíes nuevamente.",
      );
      return;
    }

    receiptUploadLockRef.current = true;
    setIsUploadingReceipt(true);
    setReceiptError("");

    try {
      // Persist the upload identity BEFORE sending the file. A lost response
      // must never result in a new upload UUID on retry.
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await receiptFile.arrayBuffer(),
      );
      const checksum = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

      const previousIntent = confirmed.receiptIntent;
      if (
        previousIntent &&
        (previousIntent.contentSha256 !== checksum ||
          previousIntent.originalName !== receiptFile.name ||
          previousIntent.mimeType !== receiptFile.type ||
          previousIntent.sizeBytes !== receiptFile.size)
      ) {
        throw new Error(
          "Hay un comprobante pendiente. Selecciona el mismo archivo original para reintentar.",
        );
      }

      const intent: ReceiptIntent = previousIntent ?? {
        idempotencyKey: crypto.randomUUID(),
        contentSha256: checksum,
        originalName: receiptFile.name,
        mimeType: receiptFile.type,
        sizeBytes: receiptFile.size,
      };
      const withIntent: PendingPurchase = {
        ...confirmed,
        receiptIntent: intent,
      };
      savePendingPurchase(withIntent);
      pendingPurchaseRef.current = withIntent;
      setPendingPurchase(withIntent);

      const formData = new FormData();
      formData.append("file", receiptFile);
      formData.append("idempotencyKey", intent.idempotencyKey);

      const response = await fetch(
        `/api/expenses/submissions/${confirmed.expenseId}/receipts`,
        {
          method: "POST",
          credentials: "same-origin",
          body: formData,
        },
      );

      const result: {
        success?: boolean;
        receipt?: { id: number };
        error?: string;
      } = await response.json();

      if (
        !response.ok ||
        result.success !== true ||
        !Number.isSafeInteger(result.receipt?.id)
      ) {
        throw new Error(
          result.error ??
            "No se pudo confirmar el comprobante. Verifica antes de reintentar.",
        );
      }

      setReceiptUploaded(true);
      setReceiptFile(null);
      setReceiptError("");
    } catch (error) {
      setReceiptError(
        error instanceof Error
          ? error.message
          : "No se pudo confirmar el comprobante.",
      );
    } finally {
      receiptUploadLockRef.current = false;
      setIsUploadingReceipt(false);
    }
  }

  function finalizePurchase() {
    const confirmed = pendingPurchaseRef.current;
    if (
      !confirmed ||
      confirmed.expenseId === null ||
      submissionLockRef.current ||
      receiptUploadLockRef.current ||
      isSaving ||
      isUploadingReceipt
    ) {
      return;
    }

    // Never abandon an upload whose server outcome is uncertain.
    if (confirmed.receiptIntent && !receiptUploaded) {
      setReceiptError(
        "Primero confirma el comprobante pendiente. Selecciona el archivo original y reintenta.",
      );
      return;
    }

    try {
      clearPendingPurchase();
    } catch {
      setReceiptError(
        "No se pudo cerrar el registro en este navegador. Intenta nuevamente.",
      );
      return;
    }

    pendingPurchaseRef.current = null;
    setPendingPurchase(null);
    setRecoveryError("");
    setFormError("");
    setReceiptError("");
    setReceiptFile(null);
    setReceiptUploaded(false);
    setReceiptInputKey((value) => value + 1);
    setCategoryId("");
    setDescription("");
    setSupplier("");
    setAmount("");
    setExpenseDate(bogotaToday());
    setPaymentMethod("CASH");
    setPurchaseMode("NEW_CASH");
    setExistingCashMovementId("");
    setShowConfirmation(false);
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-black">Registrar compra</h2>

        <p className="mt-2 text-sm text-neutral-600">
          Registra las compras del salón en Finanzas. Los pagos realizados con
          efectivo de Caja también se descontarán del saldo disponible.
        </p>
      </div>

      <div className="mt-6 space-y-5">
        {!recoveryChecked && (
          <p className="text-sm text-neutral-600">
            Verificando compras pendientes...
          </p>
        )}

        {recoveryError && (
          <div
            role="alert"
            className="rounded-xl border border-amber-300 bg-amber-50 p-4"
          >
            <p className="text-sm font-medium text-amber-950">
              {recoveryError}
            </p>

            {purchaseConfirmed && (
              <p className="mt-2 text-sm text-amber-900">
                La compra ya existe en Finanzas. No vuelvas a registrarla.
              </p>
            )}
          </div>
        )}

        {hasPendingPurchase && !purchaseConfirmed && (
          <button
            type="button"
            disabled={isSaving || !recoveryChecked}
            onClick={() => void submitPurchase()}
            className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 disabled:opacity-50"
          >
            {isSaving ? "Verificando compra..." : "Reintentar compra pendiente"}
          </button>
        )}

        {purchaseConfirmed && pendingPurchase && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="text-lg font-semibold text-emerald-950">
              Compra registrada
            </h3>

            <p className="mt-2 text-sm text-emerald-900">
              Compra #{pendingPurchase.expenseId} registrada en Finanzas. No es
              necesario registrarla nuevamente.
            </p>

            <p className="mt-2 text-sm text-emerald-900">
              {receiptUploaded
                ? "Comprobante adjuntado correctamente."
                : "Puedes adjuntar el comprobante de esta compra."}
            </p>

            {!receiptUploaded && (
              <div className="mt-4 space-y-3">
                <label
                  htmlFor="confirmed-purchase-receipt"
                  className="block text-sm font-medium text-emerald-950"
                >
                  Seleccionar comprobante
                </label>

                <input
                  id="confirmed-purchase-receipt"
                  key={`confirmed-${receiptInputKey}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  disabled={isUploadingReceipt}
                  onChange={handleReceiptSelection}
                  className="block w-full text-sm text-neutral-700"
                />

                {receiptFile && (
                  <p className="break-all text-sm text-emerald-900">
                    {receiptFile.name}
                  </p>
                )}

                <button
                  type="button"
                  disabled={isUploadingReceipt || !receiptFile}
                  onClick={() => void uploadReceipt()}
                  className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isUploadingReceipt
                    ? "Adjuntando..."
                    : "Adjuntar comprobante"}
                </button>
              </div>
            )}

            {pendingPurchase.receiptIntent && !receiptUploaded && (
              <p className="mt-3 text-sm text-amber-900">
                Comprobante pendiente:{" "}
                {pendingPurchase.receiptIntent.originalName}. Si se interrumpió
                la carga, vuelve a seleccionar el mismo archivo.
              </p>
            )}

            {receiptError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {receiptError}
              </p>
            )}

            <button
              type="button"
              onClick={finalizePurchase}
              disabled={
                isUploadingReceipt ||
                isSaving ||
                (Boolean(pendingPurchase.receiptIntent) && !receiptUploaded)
              }
              className="mt-4 w-full rounded-lg bg-emerald-800 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {receiptUploaded
                ? "Finalizar compra"
                : pendingPurchase.receiptIntent
                  ? "Confirma el comprobante para finalizar"
                  : "Finalizar sin comprobante"}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={validatePurchase}
          disabled={
            !recoveryChecked ||
            hasPendingPurchase ||
            Boolean(recoveryError) ||
            categoriesLoading ||
            showConfirmation
          }
          className="rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Revisar compra
        </button>

        {formError && (
          <p role="alert" className="text-sm text-red-700">
            {formError}
          </p>
        )}

        {showConfirmation && !hasPendingPurchase && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
            <h3 className="text-lg font-semibold text-emerald-950">
              Confirmar compra
            </h3>

            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt>Categoría</dt>
                <dd className="text-right font-medium">
                  {
                    categories.find(
                      (category) => category.id === Number(categoryId),
                    )?.name
                  }
                </dd>
              </div>

              <div className="flex justify-between gap-3">
                <dt>Valor</dt>
                <dd className="font-semibold">{formatCOP(parsedAmount)}</dd>
              </div>

              <div className="flex justify-between gap-3">
                <dt>Pago</dt>
                <dd className="text-right font-medium">
                  {
                    paymentOptions.find(
                      (option) => option.value === paymentMethod,
                    )?.label
                  }
                </dd>
              </div>

              <div className="flex justify-between gap-3">
                <dt>Fecha</dt>
                <dd>{expenseDate}</dd>
              </div>

              <div className="flex justify-between gap-3">
                <dt>Descripción</dt>
                <dd className="max-w-xs text-right break-words">
                  {description.trim()}
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-lg bg-white p-3 text-sm text-neutral-800">
              {purchaseMode === "NEW_CASH"
                ? "Se descontará el valor de Caja y se registrará el gasto en Finanzas."
                : purchaseMode === "EXISTING_CASH"
                  ? `Se vinculará el movimiento #${existingCashMovementId} sin descontar dinero nuevamente.`
                  : "Se registrará el gasto en Finanzas sin modificar el saldo de Caja."}
            </div>

            <p className="mt-3 text-xs text-emerald-900">
              La compra quedará pendiente de revisión por el propietario.
            </p>

            <button
              type="button"
              onClick={() => setShowConfirmation(false)}
              className="mt-4 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-950"
            >
              Volver a editar
            </button>

            <button
              type="button"
              disabled={isSaving || !recoveryChecked}
              onClick={() => void submitPurchase()}
              className="ml-3 mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {isSaving ? "Registrando..." : "Confirmar y registrar"}
            </button>
          </div>
        )}

        {hasPendingPurchase && (
          <p className="text-sm text-neutral-600">
            Los datos de esta compra están bloqueados hasta resolver la
            operación pendiente.
          </p>
        )}

        <fieldset
          disabled={
            !recoveryChecked ||
            hasPendingPurchase ||
            Boolean(recoveryError) ||
            showConfirmation
          }
          className="space-y-5 disabled:opacity-60"
        >
          <div>
            <label
              htmlFor="purchase-category"
              className="mb-2 block text-sm font-medium text-black"
            >
              Categoría
            </label>

            <select
              id="purchase-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={categoriesLoading || categories.length === 0}
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-black"
            >
              <option value="">
                {categoriesLoading
                  ? "Cargando categorías..."
                  : "Selecciona una categoría"}
              </option>

              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            {categoriesError && (
              <p className="mt-2 text-sm text-red-700" role="alert">
                {categoriesError}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="purchase-description"
              className="mb-2 block text-sm font-medium text-black"
            >
              Descripción
            </label>

            <textarea
              id="purchase-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Ej. Compra de esmaltes y materiales"
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black"
            />
          </div>

          <div>
            <label
              htmlFor="purchase-supplier"
              className="mb-2 block text-sm font-medium text-black"
            >
              Proveedor (opcional)
            </label>

            <input
              id="purchase-supplier"
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              maxLength={150}
              placeholder="Nombre del proveedor"
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="purchase-amount"
                className="mb-2 block text-sm font-medium text-black"
              >
                Valor en pesos
              </label>

              <input
                id="purchase-amount"
                type="number"
                min="1"
                max="2147483647"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Ej. 35000"
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black"
              />

              {validAmount && (
                <p className="mt-2 text-sm text-neutral-500">
                  {formatCOP(parsedAmount)}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="purchase-date"
                className="mb-2 block text-sm font-medium text-black"
              >
                Fecha de compra
              </label>

              <input
                id="purchase-date"
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="purchase-payment"
              className="mb-2 block text-sm font-medium text-black"
            >
              Método de pago
            </label>

            <select
              id="purchase-payment"
              value={paymentMethod}
              onChange={(event) =>
                changePaymentMethod(event.target.value as PaymentMethod)
              }
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-black"
            >
              {paymentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {paymentMethod === "CASH" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-950">
                ¿Ya registraste esta salida en Caja?
              </p>

              <div className="mt-3 space-y-3">
                <label className="flex items-center gap-3 text-sm text-neutral-800">
                  <input
                    type="radio"
                    checked={purchaseMode === "NEW_CASH"}
                    onChange={() => {
                      setPurchaseMode("NEW_CASH");
                      setExistingCashMovementId("");
                    }}
                  />
                  No, registrar una nueva salida
                </label>

                <label className="flex items-center gap-3 text-sm text-neutral-800">
                  <input
                    type="radio"
                    checked={purchaseMode === "EXISTING_CASH"}
                    onChange={() => setPurchaseMode("EXISTING_CASH")}
                  />
                  Sí, vincular una salida existente
                </label>
              </div>

              {purchaseMode === "EXISTING_CASH" && (
                <div className="mt-4">
                  <label
                    htmlFor="purchase-existing-movement"
                    className="mb-2 block text-sm font-medium text-black"
                  >
                    Número del movimiento de Caja
                  </label>

                  <input
                    id="purchase-existing-movement"
                    type="number"
                    min="1"
                    step="1"
                    value={existingCashMovementId}
                    onChange={(event) =>
                      setExistingCashMovementId(event.target.value)
                    }
                    placeholder="Ej. 25"
                    className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-black"
                  />
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <label
              htmlFor="purchase-receipt"
              className="block text-sm font-medium text-neutral-900"
            >
              Comprobante (opcional)
            </label>

            <p className="mt-1 text-xs text-neutral-600">
              Foto JPG, PNG, WebP (máximo 5 MB) o PDF (máximo 10 MB).
            </p>

            <input
              id="purchase-receipt"
              key={`initial-${receiptInputKey}`}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleReceiptSelection}
              className="mt-3 block w-full text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-100 file:px-4 file:py-2 file:font-medium file:text-emerald-900"
            />

            {receiptFile && (
              <p className="mt-3 break-all text-sm text-emerald-800">
                Archivo seleccionado: {receiptFile.name}
              </p>
            )}

            {receiptError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {receiptError}
              </p>
            )}

            <p className="mt-2 text-xs text-neutral-500">
              El comprobante se subirá después de confirmar la compra.
            </p>
          </div>
        </fieldset>
      </div>
    </section>
  );
}
