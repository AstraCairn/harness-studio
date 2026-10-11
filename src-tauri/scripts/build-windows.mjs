import { spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const [command = "build", ...args] = process.argv.slice(2)

if (process.platform !== "win32") {
  console.error("This command requires Windows.")
  process.exit(1)
}

if (command !== "build" && command !== "bundle") {
  console.error("Expected build or bundle.")
  process.exit(1)
}

// Keep temporary files and the Windows bundler's local tools on the project
// drive. Moving directories between the system drive and project drive can
// fail with Windows error 17 when Tauri extracts packaging tools.
const temp = resolve(root, "src-tauri/target/tauri-tmp")
mkdirSync(temp, { recursive: true })

const result = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/@tauri-apps/cli/tauri.js"),
    command,
    "--bundles",
    "nsis",
    ...args,
  ],
  {
    cwd: root,
    env: { ...process.env, TEMP: temp, TMP: temp },
    stdio: "inherit",
  }
)

if (result.error) {
  console.error(result.error.message)
}

process.exit(result.status ?? 1)
