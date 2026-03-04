# Course Mapper Requirements (Traceable)

This document captures requirements inferred from current implementation.

## Functional requirements

- **REQ-001 (Input file default):** The scraper shall use `./keywords-list.csv` as the default source keyword file unless overridden by `--keywordsFile`.
- **REQ-002 (Input header model):** The normalization pipeline shall support source headers `Track`, `Level`, `Core Modules`, `AI Modules`, and `Softskills` (with header normalization aliases for minor casing/spacing differences).
- **REQ-003 (Track inheritance):** If a source row has empty `Track`, the normalizer shall inherit the most recent non-empty `Track`; if no prior track exists, normalization shall fail.
- **REQ-004 (Keyword expansion):** The normalizer shall split module cells by comma and generate one normalized row per `(track, level, moduleType, keyword)` combination.
- **REQ-005 (Normalized output schema):** The normalized keyword artifact shall contain columns in this order: `track,level,levelCodes,moduleType,keyword`.
- **REQ-006 (Normalized freshness check):** The runtime shall regenerate normalized keywords only when the normalized artifact is missing or older than the source file.
- **REQ-007 (Career level parsing):** Career level parsing shall accept labels containing `A1`..`E2` patterns and map to canonical career levels.
- **REQ-008 (Instructional level mapping):** Allowed instructional levels shall be derived from `LEVEL_TO_INSTRUCTIONAL` mapping:
  - A1/A2 -> beginner
  - B1 -> beginner, intermediate
  - B2/C1 -> intermediate
  - C2 -> intermediate, expert
  - D1/D2/D3/E1/E2 -> expert
- **REQ-009 (Search URL generation):** Search URL generation shall target `/organization/search/` and include configured filters (`q`, `src=ukw`, optional `ratings`, `lang`, `instructional_level`, `duration`, `sort`).
- **REQ-010 (Per-level search passes):** For each keyword, scraping shall perform one search pass per allowed instructional level.
- **REQ-011 (Candidate discovery):** Candidate courses shall be discovered from search page anchors matching `/course/` and canonicalized by removing query/hash.
- **REQ-012 (Detail extraction):** The scraper shall open course detail pages and extract title/url/rating/ratingCount/duration fields, using runtime script and JSON-LD payload heuristics.
- **REQ-013 (Blocked keyword filtering):** Course titles shall be rejected when they contain disallowed title keywords using case-insensitive normalized substring matching.
- **REQ-014 (Rating threshold):** Eligibility filtering shall reject courses where `rating < 4.6`.
- **REQ-015 (Rating count threshold):** Eligibility filtering shall reject courses where `ratingCount < 1000`.
- **REQ-016 (Scoring and ranking):** Eligible courses shall be scored by instructional fit, rating, and rating-count popularity, then sorted by score, rating, ratingCount, and URL.
- **REQ-017 (Top courses output file):** Accepted shortlist rows shall be written to `./artifacts/udemy/top_courses.csv` with stable header order:
  `track,level,moduleType,keyword,courseInstructionalLevel,courseTitle,courseUrl,rating,ratingCount,duration,durationTotalMinutes`.
- **REQ-018 (Top courses lifecycle):** `top_courses.csv` shall be deleted at run start and recreated for the current run.
- **REQ-019 (All courses audit file):** Inspection outcomes shall be appended to `./artifacts/udemy/all_courses.csv` with headers:
  `timeAdded,keyword,courseTitle,courseUrl,rating,ratingCount,courseInstructionalLevel,durationMinutes,lastUpdated,status,failureReason`.
- **REQ-020 (Audit status model):** Audit status values shall be restricted to `inspected`, `accepted`, or `rejected`.
- **REQ-021 (Audit dedupe option):** When `--allCoursesDedupe=perRun`, duplicate rows by `normalizedKeyword|courseUrl|status` shall be skipped within the same run.
- **REQ-022 (Audit schema migration safety):** If existing audit CSV header does not match expected schema, writer shall redirect output to a `_v2` file.
- **REQ-023 (Authentication behavior):** Runtime shall fail in headless mode when unauthenticated and require a headed run for manual SSO bootstrap.
- **REQ-024 (Session persistence):** Browser sessions shall use a persistent profile directory so authentication state can be reused.
- **REQ-025 (Same-tab policy):** Runtime shall enforce same-tab navigation by closing popups/new pages.
- **REQ-026 (Run resilience):** Keyword-level failures shall be logged and processing shall continue with remaining keywords.

## Observability requirements

- **REQ-027 (Structured logs):** Logs shall include timestamp + level + message with optional JSON metadata.
- **REQ-028 (Filter observability):** Rejection decisions shall emit explicit reason codes where available.
- **REQ-029 (Throttle/backoff logging):** Rate-limit backoff events shall be logged with operation and backoff duration.
- **REQ-030 (Failure artifacts):** Navigation/detail failure paths shall emit diagnostic artifacts under `artifacts/nav_failures` and/or `artifacts/debug`.
- **REQ-031 (Run summary):** Runtime shall log end-of-run summary including output path and total duration.

## Non-functional requirements

- **REQ-032 (Sequential stability):** Runtime keyword processing shall be sequential; `--concurrency` is parsed but currently forced to `1`.
- **REQ-033 (Deterministic normalization order):** Normalized rows shall be sorted deterministically by track, level, moduleType, keyword.
- **REQ-034 (Serialized CSV writes):** Incremental CSV writes shall be queued per file path to avoid interleaved rows.
- **REQ-035 (Throttling policy):** Throttled operations shall apply jittered delays and bounded retries/backoff for rate-limit-like failures (403/429 and message heuristics).

## Known behavioral constraints (documented, not changed)

- **REQ-036 (Search rating-count mismatch):** Search URL applies `ratings` but no explicit rating-count query parameter; rating-count gate is enforced after detail extraction.
- **REQ-037 (Instructional level source):** Output `courseInstructionalLevel` is sourced from search-pass context (career-level mapping), not parsed from course detail page content.

