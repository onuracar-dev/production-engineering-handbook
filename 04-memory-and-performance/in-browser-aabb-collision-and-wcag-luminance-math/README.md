# Case Study 22: In-Browser AABB Geometry Collision & WCAG Luminance Math

> **Domain:** Memory & Performance  
> **Source Project:** `WebPageAnalyz (Advanced Browser Analyzer)`  
> **Language:** JavaScript / In-Page Evaluation  
> **Key Metric:** `AABB 2D area intersection (>400px excluding ancestry), W3C relative luminance of computed colors`

---

## 1. Problem

Auditing responsive web pages for visual interface bugs—such as overlapping modals, obscured buttons, or unreadable low-contrast text—is typically done with screenshot OCR or multi-modal Vision LLMs. Vision models introduce network latency, incur per-call API costs, are non-deterministic, and fail on dynamic viewports.

---

## 2. Why Naive Approaches Fail

1. **Multi-Modal Vision LLMs (GPT-4o / Claude Vision):**
   * Non-deterministic; hallucinations cause false positives on gradient backgrounds and miss sub-pixel collisions on complex dashboards.
2. **Canvas Pixel Diffing:**
   * Pixel diffing requires a golden baseline image. It cannot audit arbitrary third-party websites without pre-existing reference screenshots.
3. **Naive CSS Color Parsing:**
   * Checking `getComputedStyle(el).backgroundColor` returns `rgba(0,0,0,0)` (transparent) for most text nodes, failing standard WCAG contrast checks.

---

## 3. Architecture

1. **Relative Luminance:** `lum()` applies the W3C relative luminance formula to a computed CSS color. In the original analyzer, an element with a transparent background is resolved by walking up to the first non-transparent ancestor; that walk is not part of `src/`:
   `L = 0.2126 * R + 0.7152 * G + 0.0722 * B` (with sRGB gamma expansion).
2. **Axis-Aligned Bounding Box (AABB) 2D Intersection:** Evaluates 2D rectangle overlaps across `fixed`, `sticky`, and `absolute` elements in Chrome memory.
3. **Ancestry Exclusion Invariant:** Checks `!a.contains(b) && !b.contains(a)` to ensure parent containers housing child elements are never falsely flagged as collisions.
4. **Local DOM Evaluation:** Computes all calculations directly inside Chrome's V8 engine via `page.evaluate()` without sending screenshots or prompt tokens to external models.

---

## 4. Behavior Comparison

| Layout Audit Model | Latency | Resource Overhead | Determinism | Viewport Portability |
|---|---|---|---|---|
| Vision Model Prompt | Multi-second model inference | API token cost | Non-Deterministic | Dependent on screenshot resolution |
| Canvas Pixel Diffing | Rasterization overhead | High compute (CPU/GPU) | Pixel threshold fragile | Baseline required |
| **In-Browser Geometry & Math** | **Single execution tick** | **No external API calls (DOM-native)** | **Deterministic math** | **Desktop & Mobile** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/geometry_analyzer.js`](./src/geometry_analyzer.js).

---

## 6. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
