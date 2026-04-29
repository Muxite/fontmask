import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [path.join(root, "src/background.ts")],
  outfile: path.join(root, "dist/background.js"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  tsconfig: path.join(root, "tsconfig.json"),
  alias: {
    "@fontmask/config": path.join(
      root,
      "../packages/config/src/index.ts"
    ),
  },
  logLevel: "info",
});

await build({
  entryPoints: [path.join(root, "src/inject/main.ts")],
  outfile: path.join(root, "dist/page_scripts/fontmask.inject.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  tsconfig: path.join(root, "tsconfig.json"),
  alias: {
    "@fontmask/config": path.join(
      root,
      "../packages/config/src/index.ts"
    ),
  },
  supported: {
    "dynamic-import": false,
  },
  legalComments: "none",
});
