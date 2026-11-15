import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Socket.IO handshakes cannot follow Next's automatic trailing-slash redirect.
  skipTrailingSlashRedirect: true,
  transpilePackages: ["@duel/domain", "@duel/db"],
  async rewrites() {
    const port = Number(process.env.REALTIME_PORT ?? 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Invalid REALTIME_PORT");
    return [{ source: "/socket.io/:path*", destination: `http://127.0.0.1:${port}/socket.io/` }];
  },
};
export default config;
