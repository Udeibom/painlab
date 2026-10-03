import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PainLab",
  description: "A personal investigation system for recurring problems.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-stone-50 text-stone-900 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
