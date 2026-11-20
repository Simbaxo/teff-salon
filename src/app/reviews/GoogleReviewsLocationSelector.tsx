"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type GoogleLocation = {
  name: string;
  title: string;
  address: string | null;
};

type LocationsResponse = {
  locations?: GoogleLocation[];
  error?: string;
};

export default function GoogleReviewsLocationSelector() {
  const router = useRouter();

  const [locations, setLocations] = useState<GoogleLocation[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadLocations() {
      try {
        const response = await fetch("/api/admin/google-reviews/locations", {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = (await response.json()) as LocationsResponse;

        if (!response.ok) {
          throw new Error(
            data.error ?? "No se pudieron consultar los negocios.",
          );
        }

        const available = data.locations ?? [];

        if (controller.signal.aborted) return;

        setLocations(available);

        if (available.length === 1) {
          setSelected(available[0].name);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudieron cargar los negocios.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadLocations();

    return () => controller.abort();
  }, []);

  async function saveLocation() {
    if (!selected || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/admin/google-reviews/select-location",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            locationName: selected,
          }),
        },
      );

      const data = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo guardar el negocio.");
      }

      setSuccess("Negocio seleccionado correctamente.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el negocio.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <div>
        <h3 className="font-semibold">Seleccionar negocio de Google</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Selecciona la ubicación oficial de TEFF Beauty Salon para consultar
          sus reseñas.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-600">
          Consultando negocios de Google...
        </p>
      ) : (
        <>
          {locations.length > 0 ? (
            <>
              <label
                htmlFor="google-reviews-location"
                className="block text-sm font-medium"
              >
                Negocio
              </label>

              <select
                id="google-reviews-location"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                disabled={saving}
                className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Selecciona un negocio</option>

                {locations.map((location) => (
                  <option key={location.name} value={location.name}>
                    {location.title || location.name}
                    {location.address ? ` — ${location.address}` : ""}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void saveLocation()}
                disabled={!selected || saving}
                className="min-h-12 rounded-xl bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white hover:bg-[#a55e69] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar negocio"}
              </button>
            </>
          ) : (
            !error && (
              <p className="text-sm text-neutral-600">
                No se encontraron negocios en la cuenta autorizada.
              </p>
            )
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {success && (
        <p role="status" className="text-sm text-green-700">
          {success}
        </p>
      )}
    </div>
  );
}
