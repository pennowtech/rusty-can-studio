// help/HelpPreview.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import remarkDirective from "remark-directive";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faLightbulb, faTriangleExclamation, faSkullCrossbones } from "@fortawesome/free-solid-svg-icons";

import { remarkCallouts } from "./markdown/remarkCallouts";
import { useEffect, useMemo, useRef } from "react";
import { useHelpStore } from "@/components/help-system/store/helpStore";
import { useHelpTocStore } from "@/components/help-system/store/useHelpTocStore";
import { useHelpContentStore } from "./store/helpContentStore";
import { applyHighlightTheme } from "./highlightTheme";
import { useTheme } from "../ThemeProvider";
import { activateMatch, applyHighlights, applySearchHighlight } from "./utils/highlightSearch";
import "./styles/help-markdown.css";

const CALLOUT_ICONS: Record<string, any> = {
  note: faCircleInfo,
  tip: faLightbulb,
  warning: faTriangleExclamation,
  danger: faSkullCrossbones,
};

export function HelpPreview() {
  const markdownSource = useHelpContentStore((s) => s.resolvedMarkdown);
  const searchQuery = useHelpStore((s) => s.searchQuery);

  const containerRef = useRef<HTMLDivElement>(null);
  const setToc = useHelpTocStore((s) => s.setToc);
  const setTocActiveId = useHelpTocStore((s) => s.setActiveId);
  const { theme } = useTheme();

  const setResults = useHelpStore((s) => s.setSearchResults);
  const results = useHelpStore((s) => s.searchResults);
  const activeIndex = useHelpStore((s) => s.activeIndex);

  // 🔑 Sync highlight.js theme
  useEffect(() => {
    applyHighlightTheme(theme);
  }, [theme]);

  // Extract TOC once
  useEffect(() => {
    const headings = containerRef.current?.querySelectorAll("h1, h2, h3, h4") ?? [];

    const toc = Array.from(headings).map((el) => ({
      id: el.id,
      text: el.textContent ?? "",
      level: Number(el.tagName.substring(1)),
    }));

    setToc(toc);
  }, [setToc]);

  // Apply highlights when query changes
  useEffect(() => {
    if (!containerRef.current) return;

    const found = applyHighlights(containerRef.current, searchQuery);
    setResults(found);
  }, [searchQuery, setResults]);

  // Activate + scroll active match
  useEffect(() => {
    if (!results.length) return;

    activateMatch(results, activeIndex);
    results[activeIndex]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [results, activeIndex]);

  useEffect(() => {
    if (!containerRef.current) return;

    const headings = containerRef.current.querySelectorAll("h1, h2, h3");

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length > 0) {
          setTocActiveId(visible[0].target.id);
        }
      },
      {
        root: containerRef.current,
        rootMargin: "-20% 0px -70% 0px",
        threshold: [0.1, 0.5, 1],
      },
    );

    headings.forEach((h) => observer.observe(h));

    return () => observer.disconnect();
  }, [markdownSource]);

  return (
    <div ref={containerRef} className="help-markdown h-full overflow-auto px-6 py-4">
      <div className="prose dark:prose-invert max-w-none">
        <ReactMarkdown
          components={{
            div({ node, className, children, ...props }) {
              if (className?.includes("callout-header")) {
                const parent = node?.position?.start?.line;
                const calloutType = (node?.parent as any)?.data?.hProperties?.["data-callout"];

                const icon = CALLOUT_ICONS[calloutType];

                return (
                  <div className="callout-header">
                    {icon && <FontAwesomeIcon icon={icon} className="callout-icon" />}
                    <span>{children}</span>
                  </div>
                );
              }

              return <div className={className}>{children}</div>;
            },
          }}
          remarkPlugins={[remarkGfm, remarkDirective, remarkCallouts]}
          rehypePlugins={[
            rehypeSlug,
            [
              rehypeAutolinkHeadings,
              {
                behavior: "wrap",
                properties: {
                  className: ["heading-anchor"],
                },
              },
            ],
            rehypeHighlight,
          ]}
        >
          {markdownSource}
        </ReactMarkdown>
      </div>
    </div>
  );
}
