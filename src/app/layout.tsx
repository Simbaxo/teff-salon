import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/context/LanguageContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "TEFF Beauty Salon",
    template: "%s | TEFF Beauty Salon",
  },
  description:
    "Reserva y gestión de citas de TEFF Beauty Salon en Medellín.",
  applicationName: "TEFF Beauty Salon",

  manifest: "/manifest.webmanifest",

  icons: {
    apple: "/apple-touch-icon.png",
  },

  appleWebApp: {
    capable: true,
    title: "TEFF",
    statusBarStyle: "default",
  },

  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          {children}  
        </LanguageProvider>
      </body>
    </html>
  );
}
