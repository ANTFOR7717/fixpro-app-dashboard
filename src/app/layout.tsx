import "./globals.css";
import "@/config/features-index";
import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { Inter } from "next/font/google";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fix Pro AI | Free Home Repair Quotes in 5 Minutes",
  description: "Upload your home inspection report and get a detailed, free repair quote from vetted local contractors in under 5 minutes. No more closing delays.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased bg-background`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
