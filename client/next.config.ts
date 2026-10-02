import type { NextConfig } from "next";

// Case documents are opened through src/app/api/documents/, which checks that a
// firm user is signed in before fetching them from the backend.
const nextConfig: NextConfig = {
  // No Next.js badge in the corner of the screen during `next dev`. Errors still show.
  devIndicators: false,
};

export default nextConfig;
