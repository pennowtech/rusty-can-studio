import type { HelpChapter } from "@/components/help-system/model/helpChapter";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/`/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "chapter"
  );
}

function titleFromChapter(markdown: string, fallback: string) {
  const heading = markdown.match(/^##\s+(.+)$/m) ?? markdown.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || fallback;
}

export function splitHelpMarkdown(markdown: string): HelpChapter[] {
  const lines = markdown.split(/\r?\n/);
  const chapters: HelpChapter[] = [];
  let current: string[] = [];
  let order = 0;

  function pushCurrent() {
    const text = current.join("\n").trim();
    if (!text) return;
    const title = titleFromChapter(text, order === 0 ? "Overview" : `Chapter ${order + 1}`);
    chapters.push({
      id: `${slugify(title)}-${order}`,
      title,
      markdown: `${text}\n`,
      order,
    });
    order += 1;
  }

  for (const line of lines) {
    if (line.startsWith("## ") && current.length > 0) {
      pushCurrent();
      current = [line];
    } else {
      current.push(line);
    }
  }

  pushCurrent();
  return chapters.length ? chapters : [{ id: "overview-0", title: "Overview", markdown, order: 0 }];
}

export function joinHelpChapters(chapters: HelpChapter[]) {
  return chapters
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((chapter) => chapter.markdown.trim())
    .join("\n\n");
}
