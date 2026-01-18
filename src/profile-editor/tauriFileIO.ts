import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export async function openJsonFile(): Promise<string | null> {
  const path = await open({
    multiple: false,
    filters: [
      {
        name: "CAN Profile",
        extensions: ["json"],
      },
    ],
  });

  if (!path || Array.isArray(path)) return null;
  return await readTextFile(path);
}

export async function saveJsonFile(contents: string, defaultName = "can-profile.json") {
  const path = await save({
    defaultPath: defaultName,
    filters: [
      {
        name: "CAN Profile",
        extensions: ["json"],
      },
    ],
  });

  if (!path) return;
  await writeTextFile(path, contents);
}
