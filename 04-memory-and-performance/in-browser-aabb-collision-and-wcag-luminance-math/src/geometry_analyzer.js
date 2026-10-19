// Excerpt from the original analyzer's page.evaluate() body (positioned, overlapPairs and elementEvidence come from there).

// 1. Calculate W3C relative luminance of a computed CSS color
// (the walk up through transparent parents is in the original analyzer, not in this excerpt)
const rgb = (v) => (v.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lum = (v) => {
    const c = rgb(v).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * (c[0] || 0) + 0.7152 * (c[1] || 0) + 0.0722 * (c[2] || 0);
};

// 2. AABB 2D overlap detection for fixed/sticky/absolute elements
for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i].getBoundingClientRect(), b = positioned[j].getBoundingClientRect();
        const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const area = width * height;
        if (area > 400 && !positioned[i].contains(positioned[j]) && !positioned[j].contains(positioned[i])) {
            overlapPairs.push({ first: elementEvidence(positioned[i]), second: elementEvidence(positioned[j]), area });
        }
    }
}