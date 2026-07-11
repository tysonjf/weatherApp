import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Makes `next dev` expose the wrangler bindings (local D1) during development.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {};

export default nextConfig;
