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
  try {
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
  } catch {
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = defaultName;
    link.click();
    URL.revokeObjectURL(url);
  }
}
