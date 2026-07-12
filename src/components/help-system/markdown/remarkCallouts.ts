import { visit } from "unist-util-visit";
import type { Plugin } from "unified";

const CALLOUTS = {
  note: { label: "Note" },
  tip: { label: "Tip" },
  warning: { label: "Warning" },
  danger: { label: "Danger" },
} as const;

export const remarkCallouts: Plugin = () => {
  return (tree) => {
    visit(tree, (node: any) => {
      if (node.type !== "containerDirective" || !(node.name in CALLOUTS)) return;

      const data = (node.data ||= {});
      const meta = CALLOUTS[node.name as keyof typeof CALLOUTS];
      const originalChildren = node.children;

      data.hName = "div";
      data.hProperties = {
        className: ["callout", `callout-${node.name}`],
        "data-callout": node.name,
      };

      node.children = [
        {
          type: "paragraph",
          data: {
            hName: "div",
            hProperties: { className: ["callout-header"] },
          },
          children: [{ type: "text", value: meta.label }],
        },
        {
          type: "containerDirective",
          name: "callout-body",
          data: {
            hName: "div",
            hProperties: { className: ["callout-body"] },
          },
          children: originalChildren,
        },
      ];
    });
  };
};
