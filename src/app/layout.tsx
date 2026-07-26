import type { Metadata, Viewport } from "next";
import { Anton, Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

const barlowCond = Barlow_Condensed({
  variable: "--font-barlow-cond",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const barlow = Barlow({
  variable: "--font-barlow",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rockstadt Extreme Fest 2026 — Schedule Planner",
  description:
    "Unofficial offline-first schedule planner for Rockstadt Extreme Fest, 12th edition — 27-31 July 2026, Ghimbav, Romania. Tag bands, filter the calendar, spot the clashes.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "REF 2026",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0812",
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
    <html
      lang="en"
      className={`${anton.variable} ${barlowCond.variable} ${barlow.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
