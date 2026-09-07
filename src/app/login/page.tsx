"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        setError("");
        setIsSubmitting(true);

        const result = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        setIsSubmitting(false);

        if (!result || result.error) {
            setError("Correo o contraseña incorrectos.");
            return;
        }

        // Send authenticated staff into the internal TEFF area
        router.push("/staff");
        router.refresh();
    }

    return(
        <main className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
            <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold text-black">TEFF</h1>
                    <p className="mt-2 text-neutral-500">
                        Acceso del personal
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label 
                            htmlFor="email"
                            className="mb-2 block text-sm font-medium text-black"
                        >
                            Correo
                        </label>

                        <input 
                            id="email"
                            type="email" 
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                            autoComplete="email"
                            className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black outline-none focus:border-black"
                        />
                    </div>

                    <div>
                        <label 
                            htmlFor="password"
                            className="mb-2 block text-sm font-medium text-black"
                        >
                            Contraseña
                        </label>

                        <input 
                            id="password"
                            type="password" 
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                            autoComplete="current-password"
                            className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black outline-none focus:border-black"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full rounded-lg bg-black px-4 py-3 font-semibold text-white disabled:opacity-50"
                    >
                        {isSubmitting ? "Ingresando..." : "Ingresar"}
                    </button>
                </form>
            </div>
        </main>
    );
}