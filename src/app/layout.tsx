import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

const description =
  "Ask anything about the series you're reading and get answers drawn only from the books you've actually finished — cited to the chapter, with a hard stop at your spoiler line.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Catch Me Up — spoiler-free catch-ups for book series",
    template: "%s · Catch Me Up",
  },
  description,
  openGraph: {
    title: "Catch Me Up — spoiler-free catch-ups for book series",
    description,
    siteName: "Catch Me Up",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Catch Me Up",
    description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
