import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTeffToday } from "@/lib/datetime";
import ReceptionistPageClient from "./ReceptionistPageClient";
import { prisma } from "@/lib/prisma";


export default async function ReceptionistPage() {
    const session = await auth();

    // Reception operations are available to the owner and receptionist
    if (
        !session?.user ||
        !["OWNER", "RECEPTIONIST"].includes(session.user.role)
    ) {
        redirect("/login");
    }

    const today = getTeffToday();

    const todayStart = new Date(`${today}T00:00:00.000Z`);

    const tomorrow = new Date(todayStart);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const todaysSales = await prisma.sale.aggregate({
        where: {
            createdAt: {
                gte: todayStart,
                lt: tomorrow,
            },
        },
        _sum: {
            finalTotal: true,
        },
    });

    const todaysSalesTotal = todaysSales._sum.finalTotal ?? 0;

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-6xl">
                <div>
                    <h1 className="text-3xl font-bold text-black">
                        Panel de Recepción
                    </h1>

                    <p className="mt-2 text-neutral-600">
                        Operación diaria de TEFF Beauty Salon.
                    </p>

                    <p className="mt-1 text-sm text-neutral-500">
                        {today}
                    </p>
                </div>

               <ReceptionistPageClient 
                todaysSalesTotal={todaysSalesTotal}
               />
            </div>
        </main>
    );
}