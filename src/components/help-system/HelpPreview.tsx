import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import remarkDirective from "remark-directive";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { useEffect, useRef } from "react";
import { useHelpStore } from "@/components/help-system/store/helpStore";
import { useHelpTocStore } from "@/components/help-system/store/useHelpTocStore";
import { useHelpContentStore } from "./store/helpContentStore";
import { applyHighlightTheme } from "./highlightTheme";
import { useTheme } from "../ThemeProvider";
import { activateMatch, applyHighlights } from "./utils/highlightSearch";
import { remarkCallouts } from "./markdown/remarkCallouts";
import "./styles/help-markdown.css";

export function HelpPreview() {
  const markdownSource = useHelpContentStore((s) => s.selectedChapterMarkdown);
  const searchQuery = useHelpStore((s) => s.searchQuery);
  const setResults = useHelpStore((s) => s.setSearchResults);
  const results = useHelpStore((s) => s.searchResults);
  const activeIndex = useHelpStore((s) => s.activeIndex);
  const setToc = useHelpTocStore((s) => s.setToc);
  const setTocActiveId = useHelpTocStore((s) => s.setActiveId);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    applyHighlightTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const headings = containerRef.current?.querySelectorAll("h1, h2, h3") ?? [];
      setToc(
        Array.from(headings).map((el) => ({
          id: el.id,
          text: el.textContent ?? "",
          level: Number(el.tagName.substring(1)),
        })),
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [markdownSource, setToc]);

  useEffect(() => {
    if (!containerRef.current) return;

    const found = applyHighlights(containerRef.current, searchQuery);
    setResults(found);
  }, [markdownSource, searchQuery, setResults]);

  useEffect(() => {
    if (!results.length || activeIndex < 0) return;

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
          .filter((entry) => entry.isIntersecting)
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

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [markdownSource, setTocActiveId]);

  return (
    <div ref={containerRef} className="help-markdown h-full overflow-auto px-4 py-4 sm:px-6">
      <div className="prose max-w-none dark:prose-invert">
        <ReactMarkdown
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
