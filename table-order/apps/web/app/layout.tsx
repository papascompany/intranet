import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MENUBOOK",
  description: "메뉴판이 아니라, 매장의 매거진",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
