# Systems Engineering Case Study: Zero-Dependency SVG Coordinate Math Sparkline Rendering in React

---

## 1. Problem

Rendering simple six-week audit finding trends in web dashboards often tempts developers to pull in heavy charting dependencies (such as Chart.js, Recharts, or D3.js). These libraries add a significant amount of JavaScript bundle bloat, multiple canvas context lifecycles, and hydration layout shifts (CLS), negatively impacting Core Web Vitals for what is fundamentally a simple 6-point line graph.

---

## 2. Why Naive Approaches Fail

1. **Client Bundle Inflation:**
   * Adding Chart.js or Recharts increases first-contentful-paint (FCP) time and mobile memory usage.
2. **Hydration Cumulative Layout Shift (CLS):**
   * Responsive charting libraries measure container DOM dimensions asynchronously via `ResizeObserver`, rendering empty canvas spaces during SSR and snapping after hydration.
3. **Accessibility (a11y) Omission:**
   * Canvas-rendered charts are opaque pixel grids that screen readers cannot inspect without custom ARIA fallback layers.

---

## 3. Architecture

1. **Pure ViewBox Vector Projection:** Computes SVG coordinates directly in 13 lines of TypeScript:
   * Maps time intervals across the X-axis: `36 + index * (484 / (length - 1))`.
   * Scales quantitative values on the inverted Y-axis: `210 - (count / max) * 160`.
2. **Inline Polyline & Closed-Area Path Generation:**
   * Joins line coordinates using SVG path syntax: `${index ? 'L' : 'M'}${x},${y}`.
   * Closes the area under the curve to create a sleek gradient backdrop: `${line} L${endX},220 L36,220 Z`.
3. **Fixed ViewBox Aspect Ratio:** Native SVG `viewBox="0 0 560 260"` ensures the browser's layout engine reserves exact aspect ratio dimensions immediately during initial HTML parsing without client-side measurement.
4. **Built-in Semantic Accessibility:** Implements `role="img"` with an `aria-label` describing findings trends, making the chart fully screen-reader accessible.

```typescript
// 13-line zero-dependency SVG sparkline calculating polyline and area paths directly
export default function TrendChart({ data }: { data: Array<{ at: string; count: number }> }) {
  const values = data.length ? data : Array.from({ length: 6 }, (_, index) => ({ at: new Date(Date.now() - (5 - index) * 604_800_000).toISOString(), count: 0 }));
  const max = Math.max(5, ...values.map((point) => point.count));
  const points = values.map((point, index) => ({ x: 36 + index * (484 / Math.max(values.length - 1, 1)), y: 210 - (point.count / max) * 160, ...point }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  const area = `${line} L${points.at(-1)?.x || 520},220 L36,220 Z`;
  return <div className="trend-chart"><svg viewBox="0 0 560 260" role="img" aria-label="Findings trend over six weeks">
    {[50, 90, 130, 170, 210].map((y) => <line key={y} x1="36" y1={y} x2="530" y2={y} className="trend-grid" />)}
    <path d={area} className="trend-area" /><path d={line} className="trend-line" />
    {points.map((point) => <g key={point.at}><circle cx={point.x} cy={point.y} r="4.5" /><text x={point.x} y="246" textAnchor="middle">{new Date(point.at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</text></g>)}
  </svg><span><i /> Total findings</span></div>;
}
```

---

## 4. Behavior Comparison

| Chart Rendering Approach | Bundle Size Impact | Layout Shift Behavior | External Dependencies |
|---|---|---|---|
| Recharts / D3 | Heavy charting bundle | Async ResizeObserver measurement | Multiple third-party packages |
| Chart.js (Canvas) | Heavy charting bundle | Asynchronous canvas initialization | Canvas context lifecycle |
| **Native SVG Math Coordinate Component** | **Single 13-line component** | **Immediate viewBox aspect ratio reservation** | **No external dependencies** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/TrendChart.tsx`](./src/TrendChart.tsx).

---

## 6. How to Verify

Run the component size measurement script using Node.js:

```bash
node test/measure_size.js
```

### Verified Output:
```text
--- Zero-Dependency SVG Sparkline Size Measurement ---
File: src/TrendChart.tsx
Lines: 13 lines
Raw Size: 1345 bytes (1.31 KB)
Gzip Size (level 9): 764 bytes (0.75 KB)
```

_Note: Measures the source file, not a compiled/minified bundle._

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-17 (no external dependencies, native `node:zlib`)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
