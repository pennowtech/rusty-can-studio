const MARK_TAG = "mark";
const ATTR = "data-help-search";

export function clearHighlights(container: HTMLElement) {
  container.querySelectorAll(`${MARK_TAG}[${ATTR}]`).forEach((m) => {
    const parent = m.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(m.textContent || ""), m);
      parent.normalize();
    }
  });
}

export function applyHighlights(container: HTMLElement, query: string): HTMLElement[] {
  clearHighlights(container);
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const regex = new RegExp(normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const matches: HTMLElement[] = [];

  const textNodes: Node[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const parent = n.parentElement;
      if (parent && (parent.tagName.toLowerCase() === "script" || parent.tagName.toLowerCase() === "style")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    if (!text || !regex.test(text)) continue;

    regex.lastIndex = 0;
    const parts: Node[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const mark = document.createElement(MARK_TAG);
      mark.setAttribute(ATTR, "");
      mark.textContent = match[0];
      parts.push(mark);
      matches.push(mark);
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(document.createTextNode(text.slice(lastIndex)));
    }

    if (parts.length > 0 && textNode.parentNode) {
      const frag = document.createDocumentFragment();
      parts.forEach((part) => frag.appendChild(part));
      textNode.parentNode.replaceChild(frag, textNode);
    }
  }

  return matches;
}

export function activateMatch(matches: HTMLElement[], index: number) {
  matches.forEach((m, i) => m.classList.toggle("active", i === index));
}
