import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Uploads live in Vercel Blob, on a store-specific subdomain. Scoped to
    // the prefix the upload route writes under so the optimizer can't be
    // pointed at arbitrary blobs, and `search: ""` keeps signed/query-string
    // variants out.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
        port: "",
        pathname: "/notes/**",
        search: "",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
