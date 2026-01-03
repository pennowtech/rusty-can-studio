import { visit } from "unist-util-visit";
import type { Plugin } from "unified";

const CALLOUTS = {
  note: { label: "Note", icon: "note" },
  tip: { label: "Tip", icon: "tip" },
  warning: { label: "Warning", icon: "warning" },
  danger: { label: "Danger", icon: "danger" },
} as const;

export const remarkCallouts: Plugin = () => {
  return (tree) => {
    visit(tree, (node: any) => {
      if (node.type === "containerDirective" && node.name in CALLOUTS) {
        const data = (node.data ||= {});
        const meta = CALLOUTS[node.name as keyof typeof CALLOUTS];

        data.hName = "div";
        data.hProperties = {
          className: [`callout`, `callout-${node.name}`],
          "data-callout": node.name,
        };

        // 🔑 Wrap children into a body div
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
            children: node.children,
          },
        ];
      }
    });
  };
};
