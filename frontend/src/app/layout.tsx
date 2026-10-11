import type { Metadata } from "next";
import { Inter, Bodoni_Moda, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const bodoniModa = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoTest Pro — Smart Assessments for Educators",
  description:
    "AutoTest Pro helps teachers create and manage tests while giving students a streamlined examination experience. Sign in to get started.",
  keywords: ["online tests", "exam platform", "teacher tools", "student assessments"],
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${bodoniModa.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full`}
    >
      <head>
        <link rel="icon" type="image/png" href="/logo.png" />
        <link rel="shortcut icon" type="image/png" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans antialiased text-[#111111] bg-[#f9f9f9]">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            className: "!rounded-none !border !border-black !bg-white !text-[#111111] !font-sans !shadow-[4px_4px_0_0_#111111] !tracking-wide text-xs",
            classNames: {
              toast: "!rounded-none !border !border-black !bg-white !text-[#111111] !font-sans !shadow-[4px_4px_0_0_#111111]",
              title: "!font-sans !font-bold !text-xs !tracking-wider !uppercase !text-[#111111]",
              description: "!font-sans !text-xs !text-[#5f5e5e]",
              actionButton: "!bg-black !text-white !rounded-none !text-xs !font-bold !uppercase !border !border-black",
              cancelButton: "!bg-[#eeeeee] !text-[#5f5e5e] !rounded-none !text-xs !font-bold !uppercase",
              closeButton: "!border-black !text-[#111111] !rounded-none",
              error: "!border-[#ff1d58] !text-[#ff1d58]",
              success: "!border-black !text-[#111111]",
            },
          }}
        />
      </body>
    </html>
  );
}
