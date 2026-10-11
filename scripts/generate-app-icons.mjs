import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const icons = join(root, "src-tauri/icons")
const staging = join(root, "logs/icon-generation")
const cli = join(root, "node_modules/@tauri-apps/cli/tauri.js")

function generate(input, output, sizes = []) {
  mkdirSync(output, { recursive: true })
  execFileSync(
    process.execPath,
    [
      cli,
      "icon",
      input,
      "--output",
      output,
      ...sizes.flatMap((n) => ["-p", n]),
    ],
    { cwd: root, stdio: "inherit" }
  )
}

function generateTray() {
  const output = join(staging, "tray")
  generate(join(icons, "tray-icon-template.svg"), output, ["44"])
  copyFileSync(join(output, "44x44.png"), join(icons, "tray-icon-template.png"))
}

mkdirSync(staging, { recursive: true })
if (process.argv.includes("--tray-only")) {
  generateTray()
} else {
  // Keep the approved ImageGen artwork verbatim. The SVG viewport removes its
  // presentation margin; the clip gives every platform clean rounded edges.
  const source = readFileSync(join(icons, "icon-source.png")).toString("base64")
  const artwork = `
  <defs><clipPath id="tile"><rect width="512" height="512" rx="128"/></clipPath></defs>
  <g clip-path="url(#tile)">
    <rect width="512" height="512" fill="#fcf8ee"/>
    <svg width="512" height="512" viewBox="148 152 956 940" preserveAspectRatio="none">
      <image width="1254" height="1254" href="data:image/png;base64,${source}"/>
    </svg>
  </g>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${artwork}\n</svg>\n`
  writeFileSync(join(icons, "icon.svg"), svg)
  const desktop = join(staging, "desktop")
  generate(join(icons, "icon.svg"), desktop)
  for (const name of [
    "32x32.png",
    "64x64.png",
    "128x128.png",
    "128x128@2x.png",
    "icon.png",
    "icon.ico",
    ...[30, 44, 71, 89, 107, 142, 150, 284, 310].map(
      (n) => `Square${n}x${n}Logo.png`
    ),
    "StoreLogo.png",
  ]) {
    copyFileSync(join(desktop, name), join(icons, name))
  }

  // macOS needs its own 824/1024 safe area; Windows and Linux stay full-bleed.
  const padded = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g transform="translate(100,100) scale(1.609375)">${artwork}</g></svg>\n`
  const paddedPath = join(staging, "macos.svg")
  writeFileSync(paddedPath, padded)
  const macos = join(staging, "macos")
  generate(paddedPath, macos)
  copyFileSync(join(macos, "icon.icns"), join(icons, "icon.icns"))

  copyFileSync(join(icons, "32x32.png"), join(root, "public/icon-32x32.png"))
  copyFileSync(
    join(icons, "128x128.png"),
    join(root, "public/icon-128x128.png")
  )
  copyFileSync(join(icons, "icon.ico"), join(root, "src/app/favicon.ico"))
  const web = readFileSync(join(icons, "128x128@2x.png")).toString("base64")
  writeFileSync(
    join(root, "public/icon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,${web}"/></svg>\n`
  )
  generateTray()
  console.log("Updated desktop, macOS, tray and frontend icons.")
}
