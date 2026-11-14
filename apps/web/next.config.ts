import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";

loadEnv({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@duel/domain", "@duel/db"],
};
export default config;
