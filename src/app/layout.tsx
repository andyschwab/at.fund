import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSession } from "@/lib/auth/session";
import { getSessionHandle } from "@/lib/auth/session-handle";
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
  metadataBase: new URL("https://at.fund"),
  title: "at.fund — We can just pay for things",
  description:
    "No VCs, no ads — just builders getting paid directly for the work you already rely on.",
  openGraph: {
    type: "website",
    title: "at.fund — We can just pay for things",
    description:
      "No VCs, no ads — just builders getting paid directly for the work you already rely on.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "at.fund — We can just pay for things",
    description:
      "No VCs, no ads — just builders getting paid directly for the work you already rely on.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const did = session?.did ?? null;
  // Resolve handle server-side so it's available immediately on the client.
  // Best-effort — don't block render if it fails.
  const handle = session
    ? (await getSessionHandle(session).catch(() => undefined)) ?? null
    : null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <SessionProvider initial={{ hasSession: !!session, did, handle }}>
          <NavBar />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
