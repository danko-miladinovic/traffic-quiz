import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  platform: "node",
  format: "esm",
  bundle: true,
  packages: "external",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "workspace-source",
      setup(builder) {
        builder.onResolve({ filter: /^@duel\// }, ({ path }) => ({
          path: fileURLToPath(import.meta.resolve(path)),
        }));
      },
    },
  ],
});
