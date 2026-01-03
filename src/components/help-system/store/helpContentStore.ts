import { create } from "zustand";
import { loadCustomHelp, loadDefaultHelp, resetCustomHelp, saveCustomHelp } from "../utils/helpTextSave";

interface HelpContentState {
  defaultMarkdown: string;
  customMarkdown: string | null;

  isDirty: boolean;
  isSaving: boolean;

  resolvedMarkdown: string;

  loadHelp(): Promise<void>;
  setCustomMarkdown(md: string): void;
  saveCustomMarkdown(): Promise<void>;
  resetToDefaultMarkdown(): void;
}

export const useHelpContentStore = create<HelpContentState>((set, get) => ({
  defaultMarkdown: `# Welcome to the Help System3

This is the default help content. You can customize this content by providing your own markdown.

\`\`\`python
def func(a: str):
    print("ddd")

\`\`\`

:::note
This is an informational note.
:::

:::tip
Useful advice here.
:::

:::warning
Be careful with this action.
:::

:::danger
This can break things.
:::

### ✅ You should see:
- A proper highlighted code block
- Copy button
- Clipboard copies the exact code

If you still see \`[object Object]\`, then:
- You missed **either** the \`value\` prop
- Or you’re still rendering \`{children}\` somewhere

---

## 🧠 Mental model (remember this)

> In \`react-markdown\`, **never trust \`children\` to be a string**
> Always normalize before rendering or copying.

This mistake bites **everyone** at least once.

---

## ✅ Status

- ❌ Broken rendering → fixed
- ❌ Broken copy → fixed
- ❌ Object output → fixed

Your Help system is now **solid and correct**.

---

## 🔜 Next great upgrades

If you want to keep going, best next steps are:

1️⃣ **Scroll-spy TOC (active section highlight)**
2️⃣ **Search highlight inside preview**
3️⃣ **Auto-save toggle**
4️⃣ **Version history**

Tell me the next one and we’ll implement it cleanly.

## Features

- View help topics
- Navigate through the table of contents
- Search for specific information
Customize what Codex reviews

Codex searches your repository for AGENTS.md files and follows any Review guidelines you include.

To set guidelines for a repository, add or update a top-level AGENTS.md with a section like this:

## Review guidelines

- Don't log PII.
- Verify that authentication middleware wraps every route.

Codex applies guidance from the closest AGENTS.md to each changed file. You can place more specific instructions deeper in the tree when particular packages need extra scrutiny.

For a one-off focus, add it to your pull request comment, for example:

@codex review for security regressions

In GitHub, Codex flags only P0 and P1 issues. If you want Codex to flag typos in documentation, add guidance in AGENTS.md (for example, "Treat typos in docs as P1.").

Give Codex other tasks

If you mention @codex in a comment with anything other than review, Codex starts a cloud task using your pull request as context.

@codex fix the CI failuresCustomize what Codex reviews

Codex searches your repository for AGENTS.md files and follows any Review guidelines you include.

To set guidelines for a repository, add or update a top-level AGENTS.md with a section like this:

## Review guidelines

- Don't log PII.
- Verify that authentication middleware wraps every route.

Codex applies guidance from the closest AGENTS.md to each changed file. You can place more specific instructions deeper in the tree when particular packages need extra scrutiny.

For a one-off focus, add it to your pull request comment, for example:

@codex review for security regressions

In GitHub, Codex flags only P0 and P1 issues. If you want Codex to flag typos in documentation, add guidance in AGENTS.md (for example, "Treat typos in docs as P1.").

Give Codex other tasks

If you mention @codex in a comment with anything other than review, Codex starts a cloud task using your pull request as context.

@codex fix the CI failuresCustomize what Codex reviews

Codex searches your repository for AGENTS.md files and follows any Review guidelines you include.

To set guidelines for a repository, add or update a top-level AGENTS.md with a section like this:

## Review guidelines

- Don't log PII.
- Verify that authentication middleware wraps every route.

Codex applies guidance from the closest AGENTS.md to each changed file. You can place more specific instructions deeper in the tree when particular packages need extra scrutiny.

For a one-off focus, add it to your pull request comment, for example:

@codex review for security regressions

In GitHub, Codex flags only P0 and P1 issues. If you want Codex to flag typos in documentation, add guidance in AGENTS.md (for example, "Treat typos in docs as P1.").

Give Codex other tasks

If you mention @codex in a comment with anything other than review, Codex starts a cloud task using your pull request as context.

@codex fix the CI failuresCustomize what Codex reviews

Codex searches your repository for AGENTS.md files and follows any Review guidelines you include.

To set guidelines for a repository, add or update a top-level AGENTS.md with a section like this:

## Review guidelines

- Don't log PII.
- Verify that authentication middleware wraps every route.

Codex applies guidance from the closest AGENTS.md to each changed file. You can place more specific instructions deeper in the tree when particular packages need extra scrutiny.

For a one-off focus, add it to your pull request comment, for example:

@codex review for security regressions

In GitHub, Codex flags only P0 and P1 issues. If you want Codex to flag typos in documentation, add guidance in AGENTS.md (for example, "Treat typos in docs as P1.").

Give Codex other tasks

If you mention @codex in a comment with anything other than review, Codex starts a cloud task using your pull request as context.

@codex fix the CI failuresCustomize what Codex reviews

Codex searches your repository for AGENTS.md files and follows any Review guidelines you include.

To set guidelines for a repository, add or update a top-level AGENTS.md with a section like this:

## Review guidelines

- Don't log PII.
- Verify that authentication middleware wraps every route.

Codex applies guidance from the closest AGENTS.md to each changed file. You can place more specific instructions deeper in the tree when particular packages need extra scrutiny.

For a one-off focus, add it to your pull request comment, for example:

@codex review for security regressions

In GitHub, Codex flags only P0 and P1 issues. If you want Codex to flag typos in documentation, add guidance in AGENTS.md (for example, "Treat typos in docs as P1.").

Give Codex other tasks

If you mention @codex in a comment with anything other than review, Codex starts a cloud task using your pull request as context.

@codex fix the CI failures
## Getting Started

To get started, select a topic from the table of contents or use the search feature to find what you need.


Happy learning!
`,
  customMarkdown: null,

  isDirty: false,
  isSaving: false,

  get resolvedMarkdown() {
    return get().customMarkdown ?? get().defaultMarkdown;
  },

  loadHelp: async () => {
    const [defaultMd, customMd] = await Promise.all([loadDefaultHelp(), loadCustomHelp()]);

    set({
      defaultMarkdown: defaultMd,
      customMarkdown: customMd,
      resolvedMarkdown: customMd ?? defaultMd,
      isDirty: false,
    });
  },

  setCustomMarkdown(md) {
    const { defaultMarkdown } = get();
    set({
      customMarkdown: md,
      resolvedMarkdown: md,
      isDirty: md !== defaultMarkdown,
    });
  },

  saveCustomMarkdown: async () => {
    const { customMarkdown } = get();
    if (customMarkdown == null) return;

    set({ isSaving: true });
    await saveCustomHelp(customMarkdown);
    set({ isSaving: false, isDirty: false });
  },

  resetToDefaultMarkdown: async () => {
    await resetCustomHelp();
    const defaultMd = get().defaultMarkdown;
    set({
      customMarkdown: null,
      resolvedMarkdown: defaultMd,
      isDirty: false,
    });
  },
}));
