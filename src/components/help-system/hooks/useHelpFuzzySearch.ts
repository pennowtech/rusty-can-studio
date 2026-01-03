import Fuse from "fuse.js";
import { HelpSearchItem } from "@/components/help-system/model/helpSearchIndex";

export function createFuzzySearcher(items: HelpSearchItem[]) {
  return new Fuse(items, {
    keys: ["text"],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}
