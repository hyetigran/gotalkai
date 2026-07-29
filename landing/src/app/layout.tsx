import type { Metadata } from "next";
import { IBM_Plex_Mono, PT_Serif } from "next/font/google";
import "./globals.css";

const ptSerif = PT_Serif({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-pt-serif",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://gotalkai.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default:
      "Talk AI — for people who already have the words and still can't speak",
    template: "%s · Talk AI",
  },
  description:
    "Eight minutes a day on the phone with someone who remembers you. Russian speaking practice with a persistent conversation partner — not flashcards, not streaks.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Talk AI",
    title: "Talk AI — say something out loud",
    description:
      "For people who already have the words and still can't speak. Voice conversation with Валентина Сергеевна — a patient partner who remembers you.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Talk AI — say something out loud",
    description:
      "For people who already have the words and still can't speak. Russian speaking practice with a real conversation partner.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ptSerif.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
