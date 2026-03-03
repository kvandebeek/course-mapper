# Course Mapper Requirements Specification

Status legend:
- **Implemented**: behavior exists in current code and is exercised in runtime/tests.
- **Partially implemented**: behavior exists with constraints or known gaps.
- **Not implemented**: expected behavior is absent.

## 1) Functional requirements

### FR-001 Keyword ingestion from career framework CSV — **Implemented**
- The system shall ingest keywords from `keywords-list.csv` (or `--keywordsFile`) and validate required shape before scraping.

### FR-002 Track/Level normalization pipeline — **Implemented**
- The system shall normalize source rows into deterministic rows with columns: `track,level,levelCodes,moduleType,keyword`.
- It shall split multi-valued module cells, sanitize tokens, and dedupe outputs.

### FR-003 Normalized artifact freshness check — **Implemented**
- The system shall regenerate normalized keywords only when missing or stale compared to source CSV mtime.

### FR-004 Instructional level mapping — **Implemented**
- The system shall map career framework levels to one or more Udemy instructional levels via explicit mappings.

### FR-005 Filtering rules (eligibility) — **Implemented**
- The system shall exclude blocked-title courses.
- The system shall exclude courses below minimum rating threshold.
- The system shall exclude courses below minimum rating-count threshold.

### FR-006 Rating constraints — **Implemented**
- Minimum rating and minimum rating-count thresholds shall be enforced before acceptance.

### FR-007 Search URL building and filters — **Implemented**
- Search URLs shall include keyword and configured filters (`lang`, `duration`, `instructional_level`, sort).
- Search URLs shall be generated per instructional-level pass when multiple levels are allowed.

### FR-008 Result extraction strategy — **Implemented**
- The scraper shall discover candidate course URLs from search pages.
- The scraper shall extract detail-page data for candidate courses and compute acceptance/rejection.
- API-first extraction helper path with DOM fallback exists in `searchScraper`.

### FR-009 CSV outputs (exact schema) — **Implemented**
- `artifacts/udemy/top_courses.csv` columns:
  - `track,level,moduleType,keyword,courseInstructionalLevel,courseTitle,courseUrl,rating,ratingCount,duration,durationTotalMinutes`
- `artifacts/udemy/all_courses.csv` columns:
  - `runId,keyword,courseTitle,courseUrl,rating,ratingCount,courseInstructionalLevel,durationMinutes,lastUpdated,status,failureReason`

### FR-010 CLI configuration surface — **Partially implemented**
- CLI flags are exposed for browser/headless mode, pagination, throttling, file paths, durations, and all-courses dedupe mode.
- `--concurrency` is exposed but effectively forced to sequential mode.

### FR-011 Authentication/profile handling — **Implemented**
- System shall use persistent Playwright profile dir and support manual SSO bootstrap in headed mode.

---

## 2) Non-functional requirements

### NFR-001 Throttling behavior — **Implemented**
- Navigation and load-more operations shall apply throttled waits with jitter.
- Rate-limit signals shall trigger retry/backoff.

### NFR-002 Concurrency limits — **Partially implemented**
- Runtime behavior is stable by forcing sequential execution.
- User-configurable parallelism is not active.

### NFR-003 Deterministic execution characteristics — **Implemented**
- Deterministic row normalization ordering, URL canonicalization, dedupe, and serialized file writes are present.

### NFR-004 Logging clarity — **Implemented**
- Timestamped structured logs with level-based verbosity (`DEBUG` gated by flag) are present.

### NFR-005 Stability under rate limits — **Implemented**
- Retry/backoff paths for transient failures and unavailable search pages are implemented.

---

## 3) Data requirements

### DR-001 Input CSV schema — **Implemented**
- Source schema expected: `Track,Level,Core Modules,AI Modules,Softskills` (case-tolerant for track header).

### DR-002 Normalized CSV schema — **Implemented**
- Generated normalized schema: `track,level,levelCodes,moduleType,keyword`.

### DR-003 Output CSV schemas — **Implemented**
- `top_courses.csv` and `all_courses.csv` schemas are fixed and explicit (see FR-009).

### DR-004 File update behavior (incremental vs end-of-run) — **Implemented**
- Both shortlist and all-courses outputs are appended incrementally during run loops.

### DR-005 Artifact directories and profile handling — **Implemented**
- Runtime writes artifacts under `artifacts/` including `udemy/`, `debug/`, `nav_failures/`, and browser profile paths.

---

## 4) Observability requirements

### OR-001 Rejection reasons explicitness — **Implemented**
- Rejected courses are logged and audit-written with explicit reasons when available.

### OR-002 Sleep/throttle event logging — **Implemented**
- Sleep/throttle/backoff events are logged by throttle utilities and consumers.

### OR-003 Failure diagnostics artifacts — **Implemented**
- Navigation and extraction failures generate debug artifacts (e.g., HTML dumps, traces, screenshots).

---

## 5) Known gaps and risks

### GAP-001 Tenant configurability from CLI/env — **Not implemented**
- Base URL and organization path remain hardcoded in app config.

### GAP-002 Effective user-configurable concurrency — **Not implemented**
- Exposed flag exists, but runtime parser pins concurrency to 1.

### GAP-003 Artifact retention policy — **Not implemented**
- Cleanup/retention lifecycle for debug artifacts is not formally specified in code.
