const MARK_TAG = "mark";
const ATTR = "data-help-search";

export function clearHighlights(container: HTMLElement) {
  container.querySelectorAll(`${MARK_TAG}[${ATTR}]`).forEach((m) => {
    const parent = m.parentNode!;
    parent.replaceChild(document.createTextNode(m.textContent || ""), m);
    parent.normalize();
  });
}

export function applyHighlights(container: HTMLElement, query: string): HTMLElement[] {
  clearHighlights(container);
  if (!query) return [];

  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

  const matches: HTMLElement[] = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue?.trim()) continue;
    if (!regex.test(node.nodeValue)) continue;

    const span = document.createElement("span");
    span.innerHTML = node.nodeValue.replace(regex, (m) => {
      return `<${MARK_TAG} ${ATTR}>${m}</${MARK_TAG}>`;
    });

    const frag = document.createDocumentFragment();
    Array.from(span.childNodes).forEach((n) => frag.appendChild(n));
    node.parentNode!.replaceChild(frag, node);

    span.querySelectorAll(`${MARK_TAG}`).forEach((m) => matches.push(m as HTMLElement));
  }

  return matches;
}

export function activateMatch(matches: HTMLElement[], index: number) {
  matches.forEach((m, i) => m.classList.toggle("active", i === index));
}
