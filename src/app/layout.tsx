import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";
import { SessionProvider } from "@/components/SessionContext";
import { NavBar } from "@/components/NavBar";
import { LegacyMigrationModal } from "@/components/LegacyMigrationModal";
import { Footer } from "@/components/Footer";

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
  // Read identity from cookies only — no network calls, no session restore.
  // Both cookies are set at OAuth callback time and cleared on logout.
  const cookieStore = await cookies();
  const did = cookieStore.get("did")?.value ?? null;
  const handle = cookieStore.get("handle")?.value ?? null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <SessionProvider initial={{ hasSession: !!did, did, handle }}>
          <NavBar />
          <LegacyMigrationModal />
          {children}
          <Footer />
        </SessionProvider>
      </body>
    </html>
  );
}
