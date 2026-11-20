import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import InternalHeader from "@/components/InternalHeader";
import { getGoogleReviewsDashboardStats } from "@/lib/google-reviews/stats";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import GoogleReviewsLocationSelector from "./GoogleReviewsLocationSelector";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMonth(date: string) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

export default async function GoogleReviewsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;

  if (!canManageStaff(role)) {
    notFound();
  }

  const [stats, connection] = await Promise.all([
    getGoogleReviewsDashboardStats(),
    prisma.googleReviewsConnection.findUnique({
      where: { id: 1 },
      select: {
        accountName: true,
        locationName: true,
      },
    }),
  ]);

  const authorized = connection !== null;
  const locationSelected = Boolean(
    connection?.accountName && connection?.locationName,
  );
  const synchronized = stats.sync.lastSuccessfulSyncAt !== null;

  const connected = authorized && locationSelected && synchronized;

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8 text-black sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <InternalHeader
          userRole={role}
          userName={session.user.name}
        />

        <section className="mt-7 mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#B76E79]">TEFF Staff</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">Reseñas de Google</h1>
          <p className="mt-2 text-sm text-neutral-600">Reputación y seguimiento de reseñas de TEFF Beauty Salon.</p>
        </section>
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Estado de conexión</h2>

          {role === "OWNER" && !authorized && (
            <form
              method="POST"
              action="/api/admin/google-reviews/connect"
              className="mt-4"
            >
              <button
                type="submit"
                className="min-h-12 rounded-xl bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white hover:bg-[#a55e69]"
              >
                Conectar Google Business Profile
              </button>
            </form>
          )}

          <p className="mt-2 text-sm font-medium">
            {connected
              ? "Conectado con Google Business Profile"
              : authorized && !locationSelected
                ? "Cuenta autorizada. Pendiente de seleccionar el negocio."
                : authorized
                  ? "Cuenta autorizada. Pendiente de sincronización."
                  : "Pendiente de conexión con Google Business Profile."}
          </p>

          {role === "OWNER" && authorized && !locationSelected && (
            <GoogleReviewsLocationSelector />
          )}

          {stats.sync.lastSuccessfulSyncAt && (
            <p className="mt-2 text-sm text-neutral-600">
              Última sincronización:{" "}
              {formatDate(stats.sync.lastSuccessfulSyncAt)}
            </p>
          )}

          {stats.sync.lastError && (
            <p className="mt-3 text-sm text-red-700">
              Error de sincronización: {stats.sync.lastError}
            </p>
          )}
        </section>

        {connected ? (
          <>
            <section className="space-y-4">
              <h2 className="text-xl font-bold capitalize">
                Resumen de {formatMonth(stats.monthStartDate)}
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-neutral-600">
                    Reseñas nuevas este mes
                  </p>
                  <p className="mt-2 text-3xl font-bold">
                    {stats.monthly.count} / {stats.monthly.goal}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-neutral-600">Promedio mensual</p>
                  <p className="mt-2 text-3xl font-bold">
                    {stats.monthly.average === null
                      ? "Sin reseñas"
                      : `${stats.monthly.average.toFixed(2)} ★`}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Meta mínima: {stats.monthly.minimumAverage.toFixed(1)} ★
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-neutral-600">
                    Reseñas esta semana
                  </p>
                  <p className="mt-2 text-3xl font-bold">
                    {stats.weekly.count}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <p className="text-sm text-neutral-600">
                    Calificación general de Google
                  </p>
                  <p className="mt-2 text-3xl font-bold">
                    {stats.overall.averageRating === null
                      ? "No disponible"
                      : `${stats.overall.averageRating.toFixed(1)} ★`}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {stats.overall.totalReviewCount ?? "—"} reseñas en total
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Meta mensual</h2>
                <span className="font-semibold">
                  {Math.round(stats.monthly.progress)}%
                </span>
              </div>

              <div
                className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-200"
                role="progressbar"
                aria-label="Progreso de reseñas del mes"
                aria-valuemin={0}
                aria-valuemax={stats.monthly.goal}
                aria-valuenow={Math.min(
                  stats.monthly.count,
                  stats.monthly.goal,
                )}
              >
                <div
                  className="h-full rounded-full bg-[#B76E79]"
                  style={{ width: `${stats.monthly.progress}%` }}
                />
              </div>

              <p className="mt-3 text-sm text-neutral-600">
                {stats.monthly.goalAchieved
                  ? "¡Meta mensual cumplida!"
                  : `Faltan ${Math.max(stats.monthly.goal - stats.monthly.count, 0)} reseñas para la meta de cantidad.`}
              </p>

              <p className="mt-2 text-sm text-neutral-600">
                {stats.monthly.average === null
                  ? "Todavía no hay reseñas nuevas este mes."
                  : stats.monthly.average >= stats.monthly.minimumAverage
                    ? "El promedio mensual cumple la meta de calificación."
                    : "El promedio mensual todavía no cumple la meta de 4.8 estrellas."}
              </p>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">
                Calificaciones de este mes
              </h2>

              <div className="mt-4 space-y-3">
                {stats.monthly.breakdown.map(({ stars, count }) => (
                  <div key={stars} className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-sm font-medium">
                      {stars} ★
                    </span>

                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-[#B76E79]"
                        style={{
                          width: `${
                            stats.monthly.count > 0
                              ? (count / stats.monthly.count) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>

                    <span className="w-8 text-right text-sm font-semibold">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold">Reseñas recientes</h2>

              {stats.recentReviews.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-600">
                  No hay reseñas disponibles.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-neutral-100">
                  {stats.recentReviews.map((review) => (
                    <article key={review.id} className="py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">
                          {review.reviewerName || "Cliente anónimo"}
                        </p>
                        <span className="text-sm font-semibold text-[#B76E79]">
                          {review.starRating} ★
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-neutral-500">
                        {formatDate(review.publishedAt)}
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
                        {review.comment || "Reseña sin comentario."}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Rendimiento de reseñas</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Las estadísticas aparecerán cuando finalicemos la conexión y
              sincronización con Google.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
