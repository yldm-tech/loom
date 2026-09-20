import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "loom",
  description:
    "一句话生成一个网站：LLM 写文案，Jev 做判断，代码定规则。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
