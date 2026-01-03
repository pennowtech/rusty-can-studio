import { readTextFile, writeTextFile, remove, BaseDirectory } from "@tauri-apps/plugin-fs";

const HELP_DIR = "help";
const DEFAULT_FILE = `${HELP_DIR}/help.default.md`;
const CUSTOM_FILE = `${HELP_DIR}/help.custom.md`;

export async function loadDefaultHelp(): Promise<string> {
  return readTextFile(DEFAULT_FILE, { baseDir: BaseDirectory.AppConfig });
}

export async function loadCustomHelp(): Promise<string | null> {
  try {
    return await readTextFile(CUSTOM_FILE, { baseDir: BaseDirectory.AppConfig });
  } catch {
    return null;
  }
}

export async function saveCustomHelp(markdown: string) {
  await writeTextFile(CUSTOM_FILE, markdown, { baseDir: BaseDirectory.AppConfig });
}

export async function resetCustomHelp() {
  try {
    await remove(CUSTOM_FILE, { baseDir: BaseDirectory.AppConfig });
  } catch {
    /* ignore if file doesn't exist */
  }
}
