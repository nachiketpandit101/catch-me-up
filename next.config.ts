import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Keep Turbopack rooted at this app (avoids parent lockfile confusion)
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
