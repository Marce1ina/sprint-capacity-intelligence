import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(packageRoot, ".env");

let loaded = false;

/** Load `code-review/.env` into process.env (does not override existing vars). */
export function loadEnvFile(): void {
  if (loaded || !fs.existsSync(envPath)) return;
  process.loadEnvFile(envPath);
  loaded = true;
}
