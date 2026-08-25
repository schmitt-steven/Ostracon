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
  env: {
    /**
     * When this build was made, for the Deployment section of settings.
     *
     * Vercel exposes a great deal about a deployment and not one variable
     * saying when it happened, so the build stamps itself. `env` is the only
     * mechanism that can: values here are substituted into the bundles as
     * literals at build time, which is exactly the moment being recorded — a
     * real environment variable would be read at request time and tell you
     * about the cold start instead.
     *
     * In `next dev` this is when the dev server started, which is the closest
     * thing to a build time a dev server has.
     */
    BUILD_TIME: new Date().toISOString(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
