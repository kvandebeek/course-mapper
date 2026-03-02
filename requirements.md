# Course mapper requirements baseline

## Scope
Course Mapper is a TypeScript CLI that authenticates to a Udemy Business tenant, processes a curated keyword list, discovers candidate courses, extracts course details, applies eligibility filtering, and writes CSV artifacts for curriculum review.

## Met requirements

### REQ-001
The system shall provide a CLI entrypoint that orchestrates keyword normalization, authenticated scraping, per-keyword processing, and CSV export.
- Evidence: `src/cli.ts` (main orchestration flow, session bootstrap, keyword loop, CSV writer usage)
- Evidence: `package.json` (`scrape` script invokes `tsx src/cli.ts`)

### REQ-002
The CLI shall expose runtime flags for browser/headless mode, throttling, pagination, keyword file paths, and output behavior.
- Evidence: `src/config.ts` (`getCliOptions` parses CLI flags)
- Evidence: `src/cli.ts` (`printHelp` documents supported options)

### REQ-003
The system shall auto-generate a normalized keyword artifact when the normalized file is missing or stale relative to the source file.
- Evidence: `src/keywords/ensureNormalizedKeywords.ts` (mtime comparison and conditional regeneration)
- Evidence: `src/cli.ts` (calls `ensureNormalizedKeywords` before scraping)

### REQ-004
The keyword normalization pipeline shall split multi-value cells, trim/clean tokens, carry forward track labels, deduplicate rows, and output deterministic ordering.
- Evidence: `src/keywords/normalizeKeywords.ts` (splitting, sanitization, dedupe, stable sort)
- Evidence: `src/tests/normalizeKeywords.test.ts` (verifies split/trim/dedupe and deterministic output)

### REQ-005
The system shall persist browser authentication context and support manual SSO bootstrap when headless auth is unavailable.
- Evidence: `src/auth.ts` (manual login prompt when unauthenticated in headed mode; error in headless mode)
- Evidence: `src/runtime/sessionManager.ts` (persistent profile/context lifecycle)

### REQ-006
The scraper shall enforce same-tab navigation behavior to reduce flakiness from popup/tab creation.
- Evidence: `src/udemy/navigation.ts` (`enforceSameTabNavigation` wiring)
- Evidence: `src/cli.ts` (applies same-tab enforcement on runtime page/context)

### REQ-007
The search collection logic shall paginate through result pages, deduplicate course URLs, and stop when no new unique results are found.
- Evidence: `src/udemy/scrapeKeyword.ts` (URL collection loop, dedupe set, early-stop conditions)
- Evidence: `src/tests/scrapeKeyword.test.ts` and `src/tests/searchHelpers.test.ts` (URL canonicalization and pagination stop heuristics)

### REQ-008
The scraper shall apply anti-flake throttling and jitter/backoff while navigating and retrying transient failures.
- Evidence: `src/utils/throttle.ts` and `src/searchScraper.ts` (`sleepWithJitter`, throttled operations, retry loops)
- Evidence: `src/utils/retry.ts` (reusable retry helper)

### REQ-009
The search extraction flow shall prefer API payload capture and fall back to DOM extraction when API capture fails.
- Evidence: `src/searchScraper.ts` (`extractViaApiOrDom` with API-first and DOM fallback)
- Evidence: `src/udemy/searchTransport.ts` (response sniffing/predicate helpers for candidate APIs)

### REQ-010
Course detail extraction shall parse page content and structured payloads without relying on large browser-side `page.evaluate` extraction blocks.
- Evidence: `DECISIONS.md` (decision to avoid `page.evaluate` for detail extraction)
- Evidence: `src/udemy/extractCourseDetail.ts` (Node-side parsing/extraction implementation)

### REQ-011
The system shall compute course eligibility using rating and rating-count thresholds and exclude ineligible courses.
- Evidence: `src/udemy/scrapeKeyword.ts` (`computeEligibility` and acceptance/rejection logging)
- Evidence: `src/tests/scrapeKeyword.test.ts` (threshold behavior tests)

### REQ-012
The pipeline shall append output rows incrementally to CSV and guarantee header creation.
- Evidence: `src/io/incrementalCsvWriter.ts` (header checks and append queue)
- Evidence: `src/cli.ts` (incremental row appends during keyword loop)

### REQ-013
The system shall emit structured timestamped logs with level-based verbosity including debug-only output.
- Evidence: `src/logger.ts` (timestamped INFO/WARN/ERROR/DEBUG logger)
- Evidence: `src/cli.ts` and `src/searchScraper.ts` (extensive structured logging usage)

### REQ-014
The repository shall include automated tests for core parsing and scraping helper logic.
- Evidence: `src/tests/normalizeKeywords.test.ts`, `src/tests/scrapeKeyword.test.ts`, `src/tests/searchHelpers.test.ts`, `src/tests/incrementalCsvWriter.test.ts`
- Evidence: `package.json` (`test` script runs Node test suite via `tsx --test`)

### REQ-015
The project shall provide a smoke script to validate session reuse/recreation and optional detail extraction behavior.
- Evidence: `src/smoke.ts` (session lifecycle and optional extraction smoke checks)
- Evidence: `package.json` (`smoke` script)

## Not met / gaps

### GAP-001
The system should support configurable base tenant URL and organization path from environment or CLI, but these values are hardcoded.
- Note: `getAppConfig` fixes `baseUrl` and `orgHomePath` to one tenant.

### GAP-002
The system should provide true configurable concurrency for scraping/enrichment, but concurrency is effectively pinned to 1 in CLI parsing.
- Note: `--concurrency` input is ignored and set to `1`.

### GAP-003
The repository should include CI workflows that run tests and type checks on push/pull requests.
- Note: No `.github/workflows` configuration is present.

### GAP-004
The project should have a dedicated linting toolchain (for example ESLint) with enforceable style/config rules.
- Note: `lint` script aliases TypeScript no-emit checks only.

### GAP-005
The project should include explicit end-to-end/integration tests for live scraping flows beyond smoke checks.
- Note: Current tests focus on unit/helper behavior and file-level logic.

### GAP-006
The scraper should support resumable state/checkpointing to continue from last successful keyword after interruption.
- Note: Incremental CSV append exists, but there is no restart index/state manifest.

### GAP-007
The output model should include richer exported fields documented in a versioned schema (for example track/level/moduleType/score).
- Note: Main CLI export currently writes a minimal five-column CSV.

### GAP-008
The repository should document artifact retention/debug trace handling and cleanup policy.
- Note: Debug/diagnostic artifacts are generated in code, but policy/process is undocumented.
