# Course Mapper Decision Record

## ADR-001: Pipeline architecture is search -> inspect -> filter -> output

**Decision**
- The runtime keeps a linear pipeline: normalize keywords, search per keyword/level, inspect details, apply filters/scoring, then write outputs.

**Context**
- The tool must map framework keywords to courses while preserving traceability and handling unstable web responses.

**Options considered**
1. Single-stage search-only extraction without detail inspection.
2. Multi-stage pipeline with explicit detail inspection and decision points.

**Outcome**
- Adopted multi-stage pipeline implemented via `src/cli.ts` + `src/udemy/scrapeKeyword.ts` + `src/udemy/extractCourseDetail.ts`.

**Consequences**
- Better explainability and richer fields (duration/rating counts).
- Higher runtime cost due to detail page visits.

---

## ADR-002: Filtering policy uses hard gates with explicit reason codes

**Decision**
- Apply strict gates for blocked title keywords, rating threshold, and rating-count threshold before acceptance.

**Context**
- Business users need confidence and easy explanation for why courses were rejected.

**Options considered**
1. Soft scoring only (no hard rejects).
2. Hard gate first, score only remaining candidates.

**Outcome**
- Hard-gate-first policy is implemented.
- Current thresholds in `computeEligibility`: `rating >= 4.6`, `ratingCount >= 1000`.
- Blocked keywords are case-insensitive normalized substring checks.

**Consequences**
- Predictable quality floor.
- Potentially fewer accepted courses for niche keywords.

---

## ADR-003: Career level to instructional level mapping is explicit and fixed

**Decision**
- Keep a static mapping from framework levels to allowed Udemy instructional levels.

**Context**
- Framework levels and instructional levels use different taxonomies.

**Options considered**
1. Dynamic mapping via heuristics from titles/descriptions.
2. Static mapping table maintained in code.

**Outcome**
- Static mapping in `LEVEL_TO_INSTRUCTIONAL` is used and searched per-level pass.

**Consequences**
- Transparent behavior and deterministic URLs.
- Mapping updates require code change.

---

## ADR-004: Data retention keeps shortlist per run and audit history across runs

**Decision**
- `top_courses.csv` is regenerated per run; `all_courses.csv` is append-oriented history.

**Context**
- Consumers need both current shortlist and historical inspection evidence.

**Options considered**
1. Recreate all outputs each run.
2. Keep shortlist fresh but preserve inspection history.

**Outcome**
- Adopted option 2.
- Audit writer also supports `_v2` fallback when existing headers are incompatible.

**Consequences**
- Enables trend review and manual retrospective curation.
- Historical file size growth must be managed operationally.

---

## ADR-005: Instructional level is taken from search context, not detail parsing

**Decision**
- Output `courseInstructionalLevel` from the instructional-level search pass context.

**Context**
- Detail extraction currently targets title/rating/ratingCount/duration and does not parse a canonical instructional-level field.

**Options considered**
1. Infer instructional level from detail page text.
2. Use known search filter context that produced candidate.

**Outcome**
- Search-context value is used in exports and audit rows.

**Consequences**
- Stable and deterministic value assignment.
- May differ from course marketing labels not represented in search filter taxonomy.

---

## ADR-006: Throttling/backoff policy is centralized and jittered

**Decision**
- Wrap sensitive operations in `throttled()` with jitter and bounded retries/backoff.

**Context**
- Udemy organization pages can intermittently return 403/429 or transient anti-bot states.

**Options considered**
1. Fixed sleeps only.
2. Retry with jitter/backoff and rate-limit signal detection.

**Outcome**
- Centralized throttling policy implemented with defaults:
  - max attempts: 3
  - jitter ratio: 0.15
  - backoff base: 25ms
  - backoff max: 200ms
- Search-unavailable pages additionally use exponential retry in search flow.

**Consequences**
- Improved reliability.
- Runtime duration variance due to jitter/retries.

---

## ADR-007: Playwright reliability uses persistent desktop context + same-tab enforcement

**Decision**
- Use persistent browser context with fixed desktop viewport and enforce single-tab flow.

**Context**
- SSO and session reuse are required for non-interactive runs; popup behavior can destabilize extraction.

**Options considered**
1. Fresh ephemeral context every run.
2. Persistent profile and single-tab guardrails.

**Outcome**
- Persistent profile directory is used; popups/new pages are closed.
- Default viewport is desktop (`1440x900`).

**Consequences**
- Better session continuity and reproducibility.
- Requires first headed run for SSO bootstrap when profile is empty.

---

## ADR-008: Determinism favors ordered normalization and serialized writes

**Decision**
- Keep deterministic ordering where possible and serialize output writes per file.

**Context**
- Consumers compare outputs across runs and need stable structure.

**Options considered**
1. Max throughput with unconstrained async writes.
2. Ordered normalization + queued appends.

**Outcome**
- Deterministic normalization sort order and per-file append queues are implemented.

**Consequences**
- Stronger reproducibility of file structure/order.
- Throughput is intentionally lower than highly parallel alternatives.

