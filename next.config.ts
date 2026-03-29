import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Hostnames only (not full URLs) — see Next.js dev cross-origin HMR warning
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
