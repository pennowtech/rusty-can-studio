import type { HelpSearchItem } from "@/components/help-system/model/helpSearchIndex";

export function buildSearchIndex(container: HTMLElement): HelpSearchItem[] {
  const items: HelpSearchItem[] = [];

  const selectors = ["h1", "h2", "h3", "h4", "p", "li", "td"];

  container.querySelectorAll(selectors.join(",")).forEach((el, i) => {
    const text = el.textContent?.trim();
    if (!text) return;

    items.push({
      id: `${el.tagName}-${i}`,
      text,
      element: el as HTMLElement,
    });
  });

  return items;
}
