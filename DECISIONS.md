# Decisions

## 2026-03-02: Fix `__name is not defined` in detail extraction

- **Root cause:** `extractCourseDetail` used `page.evaluate(() => { ... })` with a large in-page function in `src/udemy/extractCourseDetail.ts`. In strict TypeScript + modern transpilation pipelines, helper symbols can be introduced in transformed function text, and those helpers are unavailable in the browser context used by Playwright `evaluate`, causing runtime `ReferenceError: __name is not defined`.
- **Fix:** Removed the brittle `page.evaluate` extraction path entirely and replaced it with Node-side parsing using Playwright locators (`script[type="application/ld+json"]`, `meta[property="og:url"]`) and HTML parsing from `page.content()` for `window.UD` JSON assignment.
- **Why this prevents recurrence:** The new extractor does not execute transpiled function bodies inside page context, so Node/transpiler helper leakage into browser context cannot occur. Any values needed from the page are read via locator APIs or serialized HTML content.
- **Hardening added:** Detail extraction now returns a typed discriminated result (`ok` / `reason`) with diagnostics payload (URL, title, primary container HTML snippet) for parse failures instead of throwing for expected selector/payload drift.
