const { spawnSync } = require("node:child_process");
const path = require("node:path");

const script = process.argv[2];
const args = process.argv.slice(3);

if (!script) {
  console.error("Usage: node scripts/run-powershell-script.cjs <script.ps1> [args...]");
  process.exit(1);
}

const command = process.platform === "win32" ? "powershell.exe" : "pwsh";
const scriptPath = path.resolve(process.cwd(), "scripts", script);
const result = spawnSync(command, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
