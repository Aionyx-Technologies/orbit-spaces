import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";

const root = realpathSync.native(process.cwd());
const entry = join(root, "node_modules", "vitest", "vitest.mjs");

const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
