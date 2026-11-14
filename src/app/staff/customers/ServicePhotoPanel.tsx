"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";

type ServicePhotoPanelProps = {
  appointmentId: number;
  serviceId: number;
  photos: { id: number; note: string | null }[];
};

const MAX_PHOTOS = 4;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

async function getErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

export default function ServicePhotoPanel({
  appointmentId,
  serviceId,
  photos,
}: ServicePhotoPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || photos.length >= MAX_PHOTOS) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const original = data.get("image");

    if (!(original instanceof File) || original.size === 0) {
      setMessage("Selecciona una foto.");
      return;
    }

    setBusy(true);
    setMessage("Preparando foto…");

    try {
      const compressed = await imageCompression(original, {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 1600,
        fileType: "image/jpeg",
        preserveExif: false,
        useWebWorker: true,
      });

      if (compressed.size > MAX_IMAGE_BYTES) {
        setMessage("La foto debe pesar 3 MB o menos.");
        return;
      }

      data.set("image", compressed, "foto.jpg");
      setMessage("Subiendo foto…");

      const response = await fetch(
        `/api/appointments/${appointmentId}/services/${serviceId}/photos`,
        { method: "POST", body: data },
      );

      if (!response.ok) {
        setMessage(
          await getErrorMessage(response, "No se pudo guardar la foto."),
        );
        router.refresh();
        return;
      }

      form.reset();
      setMessage("Foto guardada.");
      router.refresh();
    } catch {
      setMessage(
        "No se pudo preparar o subir la foto. Intenta con una imagen JPEG o PNG.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(photoId: number) {
    if (busy || !window.confirm("¿Eliminar esta foto del servicio?")) return;

    setBusy(true);
    setMessage("Eliminando foto…");

    try {
      const response = await fetch(`/api/customer-photos/${photoId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setMessage(
          await getErrorMessage(response, "No se pudo eliminar la foto."),
        );
        return;
      }

      setMessage("Foto eliminada.");
      router.refresh();
    } catch {
      setMessage("No se pudo eliminar la foto. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-2 rounded-xl border border-neutral-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        Fotos del servicio ({photos.length}/{MAX_PHOTOS})
      </summary>

      <div className="space-y-4 px-4 pb-4">
        {photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map(({ id, note }, index) => {
              const url = `/api/customer-photos/${id}`;

              return (
                <li key={id} className="min-w-0 space-y-2">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {/* The private image route uses the signed-in browser session. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Foto ${index + 1} del servicio`}
                      loading="lazy"
                      className="aspect-square w-full rounded-lg bg-neutral-100 object-cover"
                    />
                  </a>
                  {note && (
                    <p className="break-words text-sm text-neutral-700">
                      {note}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removePhoto(id)}
                    aria-label={`Eliminar foto ${index + 1}`}
                    className="min-h-11 text-sm font-medium text-red-700 underline disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {photos.length < MAX_PHOTOS && (
          <form onSubmit={uploadPhoto}>
            <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
              <label className="block text-sm font-medium">
                Seleccionar foto
                <input
                  type="file"
                  name="image"
                  accept="image/*"
                  required
                  className="mt-1 block w-full text-sm"
                />
              </label>
              <label className="block text-sm font-medium">
                Nota (opcional)
                <input
                  name="note"
                  maxLength={200}
                  className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3"
                />
              </label>
              <button
                type="submit"
                className="min-h-11 rounded-xl bg-black px-4 text-sm font-semibold text-white"
              >
                Agregar foto
              </button>
            </fieldset>
          </form>
        )}

        <p role="status" className="text-sm text-neutral-700">
          {message}
        </p>
      </div>
    </details>
  );
}
