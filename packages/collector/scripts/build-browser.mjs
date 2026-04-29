import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [path.join(root, "src/browser.ts")],
  outfile: path.join(root, "dist/font-signals.iife.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  tsconfig: path.join(root, "tsconfig.json"),
  alias: {
    "@fontmask/config": path.join(
      root,
      "../config/src/index.ts"
    ),
  },
});
