"use client";

import {
  CalendarDays,
  Check,
  Download,
  MapPin,
  Share2,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { toBlob } from "html-to-image";

export type StaffBookingConfirmationDetails = {
  bookingId: number;
  customerName: string;
  date: string;
  services: {
    id: number;
    name: string;
    technician: string;
    startTime: string;
  }[];
};

type Props = {
  booking: StaffBookingConfirmationDetails;
  onNewBooking: () => void;
  onClose: () => void;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const hour = hours % 12 || 12;
  const period = hours >= 12 ? "p. m." : "a. m.";

  return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

export default function StaffBookingConfirmation({
  booking,
  onNewBooking,
  onClose,
}: Props) {
  const firstTime = booking.services[0]?.startTime;

  // References only the customer-facing confirmation card.
  const confirmationCardRef = useRef<HTMLElement>(null);

  const [exportingImage, setExportingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  async function generateConfirmationImage(): Promise<Blob> {
    const card = confirmationCardRef.current;

    if (!card) {
      throw new Error("La tarjeta de confirmación no está disponible.");
    }

    // Wait for web fonts to finish loading before capturing.
    await document.fonts.ready;

    const image = await toBlob(card, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
    });

    if (!image) {
      throw new Error("No se pudo generar la imagen.");
    }

    return image;
  }

  async function handleSaveImage() {
    if (exportingImage) return;

    setExportingImage(true);
    setImageError(null);

    try {
      const image = await generateConfirmationImage();
      const url = URL.createObjectURL(image);

      const link = document.createElement("a");
      link.href = url;
      link.download = `TEFF-Confirmacion-${booking.bookingId}.png`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      // Allow the browser time to begin the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error("Confirmation image export failed:", error);

      setImageError("No se pudo guardar la imagen. Intenta nuevamente.");
    } finally {
      setExportingImage(false);
    }
  }

  async function handleShareImage() {
    if (exportingImage) return;

    setExportingImage(true);
    setImageError(null);

    try {
      const image = await generateConfirmationImage();

      const file = new File(
        [image],
        `TEFF-Confirmacion-${booking.bookingId}.png`,
        { type: "image/png" },
      );

      const shareData = {
        files: [file],
        title: "Confirmación de cita TEFF",
      };

      if (
        typeof navigator.share !== "function" ||
        typeof navigator.canShare !== "function" ||
        !navigator.canShare(shareData)
      ) {
        // Some browsers cannot share PNG files directly.
        // Download the image instead of showing an error.
        const url = URL.createObjectURL(file);

        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;

        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

        return;
      }

      await navigator.share(shareData);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      console.error("Confirmation image sharing failed:", error);

      setImageError("No se pudo compartir la imagen. Usa Guardar imagen.");
    } finally {
      setExportingImage(false);
    }
  }

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-black/60 px-3 py-5 sm:py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-confirmation-title"
        className="mx-auto w-full max-w-md sm:max-w-lg md:max-w-2xl"
      >
        {/* Customer-facing confirmation image */}
        <article
          ref={confirmationCardRef}
          className="overflow-hidden rounded-3xl bg-white text-neutral-900 shadow-2xl"
        >
          <div className="bg-[#F7F2F0] px-6 pb-7 pt-8 text-center">
            <div className="font-serif text-5xl tracking-[0.22em] text-neutral-900">
              TEFF
            </div>

            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-neutral-600">
              Beauty Salon
            </p>

            <div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-full bg-[#E4F1E7] text-[#377A55]">
              <Check className="h-9 w-9" strokeWidth={2.5} />
            </div>

            <h2
              id="staff-confirmation-title"
              className="mt-5 text-2xl font-bold tracking-tight"
            >
              ¡Tu cita está confirmada!
            </h2>

            <p className="mt-2 text-sm text-neutral-600">
              ¡Gracias por elegir TEFF! 💗
            </p>
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#1F5A43]">
                Tu próxima cita
              </p>

              <p className="mt-2 text-xl font-semibold">
                {booking.customerName}
              </p>

              <p className="mt-1 text-xs text-neutral-500">
                Reserva #{booking.bookingId}
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-[#1F5A43]" />

                <div>
                  <p className="text-sm font-semibold capitalize">
                    {formatDate(booking.date)}
                  </p>

                  {firstTime && (
                    <p className="mt-1 text-sm text-neutral-600">
                      {formatTime(firstTime)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-neutral-200 pt-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-5 w-5 text-[#1F5A43]" />
                Tus servicios
              </h3>

              <div className="mt-4 divide-y divide-neutral-100">
                {booking.services.map((service) => (
                  <div key={service.id} className="py-3 first:pt-0">
                    <p className="font-semibold">{service.name}</p>

                    <p className="mt-1 text-sm text-neutral-600">
                      Profesional: {service.technician}
                    </p>

                    <p className="mt-1 text-xs text-neutral-500">
                      Hora: {formatTime(service.startTime)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-neutral-200 pt-5">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#1F5A43]" />

                <div>
                  <p className="text-sm font-semibold">TEFF Beauty Salon</p>

                  <p className="mt-1 text-sm leading-6 text-neutral-600">
                    Cra. 43A #11-73
                    <br />
                    El Poblado, Medellín
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#F7F2F0] px-6 py-4 text-center">
            <p className="text-xs font-medium text-neutral-600">
              ¡Te esperamos para consentirte! ✨
            </p>
          </div>
        </article>

        {/* Image actions: outside the customer-facing card */}
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleSaveImage}
              disabled={exportingImage}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white px-5 py-3 text-sm font-semibold text-neutral-900 shadow-sm hover:bg-neutral-100 disabled:opacity-60"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
              Guardar imagen
            </button>

            <button
              type="button"
              onClick={handleShareImage}
              disabled={exportingImage}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#377A55] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#2D6545] disabled:opacity-60"
            >
              <Share2 className="h-5 w-5" aria-hidden="true" />
              Compartir imagen
            </button>
          </div>

          {exportingImage && (
            <p role="status" className="text-center text-sm text-white">
              Preparando imagen...
            </p>
          )}

          {imageError && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700"
            >
              {imageError}
            </p>
          )}
        </div>

        {/* Staff-only controls: outside the screenshot card */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onNewBooking}
            className="min-h-12 rounded-xl bg-[#1F5A43] px-3 py-3 text-sm font-semibold text-white"
          >
            Nueva cita
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-neutral-900"
          >
            Volver a la agenda
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-white/80">
          Captura la tarjeta de arriba para enviarla al cliente.
        </p>
      </div>
    </div>
  );
}
