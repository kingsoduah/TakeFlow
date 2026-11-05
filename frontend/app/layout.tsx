import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

// latin-ext carries the naira and cedi signs.
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "TakeFlow", template: "%s · TakeFlow" },
  description: "Crypto invoices and checkout links, priced in your currency. Every payment. Accounted for.",
  icons: { icon: "/brand/takeflow-symbol.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101D30",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
