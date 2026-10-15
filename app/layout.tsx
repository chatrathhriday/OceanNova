import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LenisProvider } from "@/components/LenisProvider";
import { ToastProvider } from "@/components/Toast";
import { SoundProvider } from "@/components/SoundEngine";
import { CustomCursor } from "@/components/CustomCursor";
import { Loader } from "@/components/Loader";
import { BackgroundParticles } from "@/components/BackgroundParticles";
import { DepthBackground } from "@/components/DepthBackground";
import { ScrollWaveIndicator } from "@/components/ScrollWaveIndicator";
import { Navbar } from "@/components/Navbar";
import { ScrollBuoy } from "@/components/ScrollBuoy";
import { MessageBottle } from "@/components/MessageBottle";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display-var",
  weight: ["400", "500", "600", "700"],
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body-var",
  weight: ["400", "500", "600"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-var",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "OCEANNOVA — Decode the Deep. Detect the Unseen.",
  description:
    "AI-powered ocean anomaly detection platform. Real-time monitoring of temperature, salinity, currents and chemistry across the world's oceans.",
  keywords: ["ocean", "anomaly detection", "AI", "marine science", "OCEANNOVA"],
};

export const viewport: Viewport = {
  themeColor: "#064273",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="bg-abyssal-navy font-body text-silver antialiased">
        <Loader />
        <DepthBackground />
        <BackgroundParticles />
        <div className="noise-overlay" aria-hidden />
        <SoundProvider>
          <CustomCursor />
          <ToastProvider>
            <LenisProvider>
              <ScrollWaveIndicator />
              <Navbar />
              {children}
              <ScrollBuoy />
              <MessageBottle />
            </LenisProvider>
          </ToastProvider>
        </SoundProvider>
      </body>
    </html>
  );
}
