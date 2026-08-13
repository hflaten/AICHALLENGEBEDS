import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KPMG Lead Generator",
  description: "RAG-powered lead generation workspace for KPMG consultancy teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
