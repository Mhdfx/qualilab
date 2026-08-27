import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  // 300 was shipped but never used anywhere — one font file less to load.
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: {
    default: "Qualilab International — LIMS",
    template: "%s · Qualilab LIMS",
  },
  description:
    "Système de gestion des prélèvements et analyses — Qualilab International",
  icons: {
    icon: "/qualilab-logo-nobg.png",
    apple: "/qualilab-logo-nobg.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${poppins.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
