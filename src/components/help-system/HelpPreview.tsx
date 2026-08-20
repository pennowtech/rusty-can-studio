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

  const chapters = useHelpContentStore((s) => s.chapters);
  const selectedChapterId = useHelpContentStore((s) => s.selectedChapterId);
  const selectChapter = useHelpContentStore((s) => s.selectChapter);

  useEffect(() => {
    if (!containerRef.current) return;

    const trimmedQuery = searchQuery.trim().toLowerCase();
    if (trimmedQuery) {
      const currentHasMatch = markdownSource.toLowerCase().includes(trimmedQuery);
      if (!currentHasMatch && chapters.length > 0) {
        const firstMatchingChapter = chapters.find((c) =>
          c.markdown.toLowerCase().includes(trimmedQuery) || c.title.toLowerCase().includes(trimmedQuery)
        );
        if (firstMatchingChapter && firstMatchingChapter.id !== selectedChapterId) {
          selectChapter(firstMatchingChapter.id);
          return;
        }
      }
    }

    const found = applyHighlights(containerRef.current, searchQuery);
    setResults(found);
  }, [markdownSource, searchQuery, setResults, chapters, selectedChapterId, selectChapter]);

  useEffect(() => {
    if (!results.length || activeIndex < 0 || activeIndex >= results.length) return;

    const el = results[activeIndex];
    if (!el || !el.isConnected || !containerRef.current) return;

    activateMatch(results, activeIndex);

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    if (elRect.width === 0 && elRect.height === 0) return;

    const relativeTop = elRect.top - containerRect.top + container.scrollTop;
    const targetScrollTop = relativeTop - container.clientHeight / 2 + elRect.height / 2;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);

    container.scrollTo({
      top: Math.max(0, Math.min(maxScrollTop, targetScrollTop)),
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
