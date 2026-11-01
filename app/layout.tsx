import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stockwraith",
  description: "TinyFish web agents hunt live seller pages and verify every listing against your spec.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
