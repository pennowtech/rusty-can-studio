import { readTextFile, writeTextFile, remove, BaseDirectory } from "@tauri-apps/plugin-fs";
import { defaultHelpMarkdown } from "../defaultHelpMarkdown";

const HELP_DIR = "help";
const DEFAULT_FILE = `${HELP_DIR}/help.default.md`;
const CUSTOM_FILE = `${HELP_DIR}/help.custom.md`;
const CUSTOM_STORAGE_KEY = "cansim.help.customMarkdown";

export async function loadDefaultHelp(): Promise<string> {
  try {
    return await readTextFile(DEFAULT_FILE, { baseDir: BaseDirectory.AppConfig });
  } catch {
    return defaultHelpMarkdown;
  }
}

export async function loadCustomHelp(): Promise<string | null> {
  try {
    return await readTextFile(CUSTOM_FILE, { baseDir: BaseDirectory.AppConfig });
  } catch {
    return globalThis.localStorage?.getItem(CUSTOM_STORAGE_KEY) ?? null;
  }
}

export async function saveCustomHelp(markdown: string) {
  try {
    await writeTextFile(CUSTOM_FILE, markdown, { baseDir: BaseDirectory.AppConfig });
  } catch {
    globalThis.localStorage?.setItem(CUSTOM_STORAGE_KEY, markdown);
  }
}

export async function resetCustomHelp() {
  try {
    await remove(CUSTOM_FILE, { baseDir: BaseDirectory.AppConfig });
  } catch {
    /* ignore if file does not exist */
  }

  globalThis.localStorage?.removeItem(CUSTOM_STORAGE_KEY);
}
