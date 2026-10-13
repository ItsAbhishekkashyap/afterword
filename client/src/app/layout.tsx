import type { Metadata, Viewport } from "next";
import { Archivo, Hanken_Grotesk, Martian_Mono, Newsreader } from "next/font/google";
import { Shell } from "@/components/Shell";
import { SITE } from "@/lib/site";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], style: ["italic"], axes: ["opsz"], variable: "--font-newsreader", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const martian = Martian_Mono({ subsets: ["latin"], variable: "--font-martian", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} · ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: ["video summarizer", "meeting notes", "video transcript", "action items", "AI video assistant", "Hinglish transcription", "chat with video"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE.name, title: `${SITE.name} · ${SITE.tagline}`, description: SITE.description, url: "/" },
  twitter: { card: "summary_large_image", title: `${SITE.name} · ${SITE.tagline}`, description: SITE.description },
};

export const viewport: Viewport = { themeColor: "#F5F5F2", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${newsreader.variable} ${hanken.variable} ${martian.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
