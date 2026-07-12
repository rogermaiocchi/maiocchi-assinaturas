import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://assinatura.maiocchi.adv.br"),
  title: {
    default: "Maiocchi Assinaturas | Maiocchi Advogado",
    template: "%s | Maiocchi Assinaturas",
  },
  description:
    "Portal seguro para envio, acompanhamento e assinatura de documentos do Maiocchi Advogado.",
  applicationName: "Maiocchi Assinaturas",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
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
    siteName: "Maiocchi Assinaturas",
    title: "Maiocchi Assinaturas | Maiocchi Advogado",
    description: "Assine com clareza. Acompanhe com confiança.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Maiocchi Assinaturas, portal do Maiocchi Advogado" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Maiocchi Assinaturas | Maiocchi Advogado",
    description: "Assine com clareza. Acompanhe com confiança.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
