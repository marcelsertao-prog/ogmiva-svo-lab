import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://spread11-svo-lab.marcelsertao.chatgpt.site"),
  title: "Spread11 — SVO Lab",
  description: "Build English sentences and learn the Subject + Verb + Object pattern.",
  openGraph: {
    title: "Spread11 — SVO Lab",
    description: "Build the sentence. Learn the structure.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Spread11 SVO sentence activity" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Spread11 — SVO Lab",
    description: "Build the sentence. Learn the structure.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
