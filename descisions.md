# Engineering Decisions Log

This document records non-trivial technical decisions so maintainers can understand *why* the code is structured the way it is.

## 2026-03-02 — Avoid `page.evaluate` for course detail extraction

### Context

A runtime error (`ReferenceError: __name is not defined`) occurred while parsing course details via a large `page.evaluate(() => ...)` block.

### Decision

Move extraction logic from in-page evaluated JavaScript to **Node-side parsing** that uses:

- Playwright locators (`script[type="application/ld+json"]`, metadata selectors)
- `page.content()` parsing for structured blobs such as `window.UD`

### Why

- Avoids transpilation helper leakage into the browser execution context.
- Produces more diagnosable failures.
- Keeps extraction logic type-safe in the Node/TypeScript runtime.

### Consequences

- Slightly more code in Node-side parser utilities.
- Better resilience to site payload drift and easier debugging.

## 2026-03-02 — Keep scraping sequential by default

### Context

Udemy Business search endpoints can trigger anti-automation safeguards when queried too aggressively.

### Decision

Treat concurrency conservatively (default and effective behavior of `1`) and rely on throttle + jitter/backoff.

### Why

- Prioritizes run completion and account/session stability over throughput.
- Reduces transient “search unavailable” responses.

### Consequences

- Longer total runtime for large keyword sets.
- More predictable execution and fewer partial failures.

## 2026-03-02 — Normalize keywords before scraping

### Context

Raw keyword files may include duplicate phrases, inconsistent casing, or malformed rows.

### Decision

Make normalization a first-class pre-step and auto-regenerate normalized output when stale/missing.

### Why

- Improves deterministic scraper behavior.
- Removes repetitive input cleanup from main scraping logic.

### Consequences

- Adds one preprocessing artifact (`artifacts/keywords.normalized.csv`).
- Makes runs easier to reproduce and debug.
