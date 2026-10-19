export interface MacroSelectionResult {
  selected: boolean;
  index: number;
  title: string;
  href: string;
  totalResults: number;
}

// Runs on an already loaded results page; `query` is only used in the error message.
export function executeSearchAndSelectMacro(
  query: string,
  targetIndex: number = 0
): MacroSelectionResult | { error: string } {
  const resultSelectors = [
    'ytd-video-renderer a#video-title',
    'a#video-title',
    'ytd-rich-item-renderer a#video-title-link',
    '#search a:has(h3)',
    '.g a:has(h3)',
    '.g a',
    'main a[href]:has(h2, h3)',
    'article a[href]',
    '.result__title a',
  ];

  let resultElements: HTMLAnchorElement[] = [];
  for (const sel of resultSelectors) {
    const found = Array.from(document.querySelectorAll(sel)).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (el as HTMLElement).offsetParent !== null;
    }) as HTMLAnchorElement[];

    if (found.length > 0) {
      resultElements = found;
      break;
    }
  }

  if (resultElements.length > 0) {
    const clampedIndex = Math.max(0, Math.min(targetIndex, resultElements.length - 1));
    const targetEl = resultElements[clampedIndex];

    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    targetEl.click();

    return {
      selected: true,
      index: clampedIndex,
      title: (targetEl.innerText || targetEl.textContent || "").trim(),
      href: targetEl.href || "",
      totalResults: resultElements.length,
    };
  }

  return { error: `No visible result links found for query: ${query}` };
}
