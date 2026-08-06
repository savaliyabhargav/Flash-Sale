import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flash-Sale Commerce",
  description: "Flash-Sale Commerce Platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
