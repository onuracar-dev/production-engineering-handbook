# Case Study 21: Crawler Trap Mitigation & Combinatorial Query Explosion Defense

> **Domain:** Autonomous Agents & Automation  
> **Source Project:** `WebPageAnalyz (Crawler Core)`  
> **Language:** Node.js  
> **Key Metric:** `maxCalendarYearDrift: 5, query variants clamped to 5, path depth 16, sitemap decompression limits`

---

## 1. Problem

Automated website crawlers face adversarial website architectures: infinite calendar widgets (clicking "Next Year" into infinity), faceted eCommerce search filters generating factorial query permutations (`?color=red&size=m&sort=asc...`), and deep cyclic URL structures. Without explicit boundaries, crawlers run out of memory or DDoS target hosts.

---

## 2. Why Naive Approaches Fail

1. **Simple URL Visited Sets:**
   * Tracking visited URLs in a Set fails because dynamic parameters (`?page=1000`, `?date=2040`) generate millions of unique strings for identical pages.
2. **Infinite Sitemap Recursion:**
   * Malicious or recursive sitemap indexes nested 50 levels deep exhaust memory or trigger gzip decompression bombs.
3. **Unbounded URL Queues:**
   * Allowing queues to grow without limits causes memory leaks and starves container worker pools.

---

## 3. Architecture

1. **Calendar Year Drift Clamping:** Rejects calendar drift beyond `maxCalendarYearDrift: 5`, immediately severing infinite calendar date click loops.
2. **Path Depth & Combinatorial Query Ceilings:** Restricts maximum URL path depth to 16 and clamps query parameter variants per unique path to 5, killing faceted search explosions.
3. **Pagination Upper Bounds:** Imposes a strict ceiling on pagination numbers (`maxPaginationValue: 250`) preventing crawlers from crawling arbitrarily large pagination sequences.
4. **Sitemap Decompression & Depth Fencing:** Caps sitemap decompression at 8 MB and nesting depth at 3, neutralizing XML expansion bombs.
5. **Bounded Overrides:** `resolveDiscoveryLimits()` accepts per-scan overrides but clamps each one (sitemap depth at most 5, decompressed size at most 50 MB, the sitemaps.org per-file maximum); a missing or non-integer override falls back to the default.

---

## 4. Behavior Comparison

| Crawler Traversal Model | Infinite Calendar Trap | Faceted Search Explosion | Memory Footprint |
|---|---|---|---|
| Basic Visited Set | Infinite Loop (Memory Crash) | Exponential (O(N!)) | Unbounded |
| Regex Blacklisting | Incomplete | Incomplete | High |
| **Strict Bounded Crawler Limits** | **Bounded (Rejects calendar drift > 5 years)** | **Clamped (Max 5 query variants)** | **Bounded by configured depth and count limits** |

_Qualitative comparison. Numbers appear only where a script in this folder measures them._

---

## 5. Implementation

See implementation in [`src/crawler_limits.js`](./src/crawler_limits.js).

---

## 6. How to Verify

Run the automated test suite using Node.js built-in test runner:

```bash
node --test test/crawler_limits.test.js
```

### Verified Output:
```text
✔ defaults include the sitemap and queue limits (1.3241ms)
✔ overrides are clamped, and invalid values fall back to the default (0.1986ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
```

* **Test Environment:** Node.js v24.17.0, Windows 11, 2026-10-19 (no external dependencies, built-in node:test)

---

## 7. Visual Representation

![Visual Architecture Card](./assets/code-card.png)
