import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { FlowProviderWrapper } from "@/components/flow-provider-wrapper";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flow DCA - Dollar-Cost Averaging on Flow Blockchain",
  description:
    "Automate your Flow investments with smart, scheduled DCA strategies. Reduce risk and build wealth over time using Flow's Scheduled Transactions and DeFi Actions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <FlowProviderWrapper>{children}</FlowProviderWrapper>
      </body>
    </html>
  );
}
