import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./glass-system.css";

const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-400-normal.woff", weight: "400", style: "normal" },
    { path: "./fonts/inter-latin-700-normal.woff", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://assinatura.maiocchi.adv.br"),
  title: {
    default: "Documentos e assinaturas | Maiocchi Advogado",
    template: "%s | Maiocchi Advogado",
  },
  description:
    "Portal seguro para envio, acompanhamento e assinatura de documentos do Maiocchi Advogado.",
  applicationName: "Maiocchi",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/maiocchi-mark.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Maiocchi Advogado",
    title: "Documentos e assinaturas | Maiocchi Advogado",
    description: "Assine com clareza. Acompanhe com confiança.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Portal de documentos e assinaturas do Maiocchi Advogado" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Documentos e assinaturas | Maiocchi Advogado",
    description: "Assine com clareza. Acompanhe com confiança.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
