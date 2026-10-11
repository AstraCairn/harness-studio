"""Regenerate the ribbon H macOS tray template with the project's Tauri CLI.

Legacy entry point; `pnpm icons:generate` regenerates all app icon assets.
The SVG source is tray-icon-template.svg. No Python packages are required.
"""

import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]

if __name__ == "__main__":
    subprocess.run(
        ["node", str(REPO_ROOT / "scripts/generate-app-icons.mjs"), "--tray-only"],
        cwd=REPO_ROOT,
        check=True,
    )
