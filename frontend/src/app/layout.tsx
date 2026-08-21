import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoTest Pro — Smart Assessments for Educators",
  description:
    "AutoTest Pro helps teachers create and manage tests while giving students a streamlined examination experience. Sign in to get started.",
  keywords: ["online tests", "exam platform", "teacher tools", "student assessments"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full`}
    >
      <body className="min-h-full flex flex-col font-sans antialiased text-slate-600 bg-slate-50">{children}</body>
    </html>
  );
}
