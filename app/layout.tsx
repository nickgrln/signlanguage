import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sign Language Detector — FSL, understood",
  description: "A privacy-first Filipino Sign Language practice and translation companion."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
