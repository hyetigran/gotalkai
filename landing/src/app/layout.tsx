import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://gotalkai.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LingoAI — learn languages. Open the world.",
    template: "%s · LingoAI",
  },
  description:
    "Eight minutes a day on the phone with someone who remembers you. Real speaking practice with a persistent conversation partner — not flashcards, not streaks.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "LingoAI",
    title: "LingoAI — learn languages. Open the world.",
    description:
      "Eight minutes a day on the phone with someone who remembers you. Real speaking practice with a persistent conversation partner — not flashcards, not streaks.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LingoAI — learn languages. Open the world.",
    description:
      "Eight minutes a day on the phone with someone who remembers you. Real speaking practice with a persistent conversation partner — not flashcards, not streaks.",
  },
  robots: { index: true, follow: true },
};

/**
 * Runs before paint, outside React — sets `data-theme` from a saved
 * preference or `prefers-color-scheme` so the page never flashes the
 * wrong theme on load. `ThemeToggle` (client component) reads this same
 * attribute on mount rather than defaulting to light itself.
 */
const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem('lingoai-theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.dataset.theme = 'dark';
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-page text-ink">{children}</body>
    </html>
  );
}
