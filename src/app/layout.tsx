import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getDid } from "@/lib/auth/session";
import { SessionProvider } from "@/components/SessionContext";
import { NavBar } from "@/components/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "at.fund — Keep your atmosphere clean",
  description:
    "Fund what you use. Pay the builders you already rely on, directly. ATProto sign-in.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const did = await getDid();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <SessionProvider initial={{ hasSession: !!did, did }}>
          <NavBar />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
