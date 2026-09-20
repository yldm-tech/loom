import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "loom",
  description:
    "Generate a whole site from one sentence: an LLM writes the copy, Jev makes the judgement calls, and code owns the rules.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The editor's own language. The client keeps it in step with the locale
  // picker; the site being generated carries its own `lang` further down.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
