import type { NextConfig } from "next";

const API = process.env.SAPINI_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Document files are served by the backend from its synced copies.
  async rewrites() {
    return [{ source: "/api/documents/:id", destination: `${API}/documents/:id` }];
  },
};

export default nextConfig;
