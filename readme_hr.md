# Course Mapper (HR / Sales / Management Guide)

## A) What this application is and why it matters

Course Mapper helps transform career-framework learning needs into a practical Udemy course shortlist.

In business terms, it solves a recurring problem: many teams know *what capabilities* people should build (by track and level), but manual searching for courses is slow, inconsistent, and hard to audit. This tool standardizes that process by automatically searching, filtering, and recording outcomes.

The result is a repeatable evidence trail:
- a shortlist of strong candidates (`top_courses.csv`), and
- a full audit history of inspected courses with acceptance/rejection reasons (`all_courses.csv`).

---

## B) Inputs (especially keywords CSV)

Default source file is `keywords-list.csv`.

Expected columns:
- **Track**: role family / domain (for example QA, Engineering, Security, etc.)
- **Level**: framework level (A1, A2, B1, …)
- **Core Modules**: comma-separated technical/domain keywords
- **AI Modules**: comma-separated AI-related keywords
- **Softskills**: comma-separated behavioral/communication/leadership keywords

### How module columns become search keywords
Each comma-separated item becomes an individual keyword row. So one source row can generate many independent searches.

### How Level controls acceptable instructional levels
Level mapping (exactly as implemented):
- A1, A2 -> beginner
- B1 -> beginner + intermediate
- B2, C1 -> intermediate
- C2 -> intermediate + expert
- D1, D2, D3, E1, E2 -> expert

### How blocked/disallowed keywords work
The tool has a predefined list of blocked title phrases (e.g., specific out-of-scope topics). Matching is:
- case-insensitive,
- normalized text comparison,
- substring-based (if blocked phrase appears inside title, it is rejected).

### Simple CSV example

```csv
Track,Level,Core Modules,AI Modules,Softskills
Software Engineering,A1,Software Testing,Prompt Engineering,Communication
Software Engineering,B1,API Testing,LLM Evaluation,Stakeholder Management
```

---

## C) Pipeline step-by-step

1. **Read and normalize keyword source file**
   - Reads `keywords-list.csv`.
   - Cleans headers and values.
   - Splits module lists by comma.
   - Produces normalized rows with fields like `track`, `level`, `moduleType`, `keyword`.

2. **Expand module lists into individual keyword rows**
   - Example output rows: `(Track, Level, moduleType=core, keyword="API Testing")`, etc.

3. **Build Udemy organization search URL for each keyword**
   - Includes filters for language, rating, durations, instructional level, and sort.

4. **Open search results using Playwright (desktop browser automation)**
   - Uses a persistent browser profile so SSO can be reused.
   - Runs in one tab (new popups/tabs are closed).

5. **Collect course candidates from results pages**
   - Finds course URLs from search page content.
   - Handles pagination/load-more behavior up to configured limits.

6. **Inspect each candidate course**
   - Opens detail page and extracts fields (title, rating, rating count, duration, etc.).
   - Applies filtering rules:
     - blocked/disallowed title keywords,
     - rating threshold,
     - rating-count threshold.
   - Records status as accepted or rejected with reason.

7. **Persist outputs**
   - `top_courses.csv`: accepted shortlist for current run.
   - `all_courses.csv`: all inspected outcomes, append-oriented history across runs.

8. **Logging and observability**
   - Logs keyword progress, filter decisions, retry/backoff actions, and summary counts.
   - Rejection reasons are written to audit output when available.

9. **Performance/stability controls**
   - Uses throttling, jitter, retries, and backoff to reduce rate-limit/anti-bot issues.

---

## D) Outputs and business usage

## 1) `top_courses.csv` (shortlist)
Primary file for HR/L&D curation.

Columns include:
- track, level, moduleType, keyword
- courseInstructionalLevel
- courseTitle, courseUrl
- rating, ratingCount
- duration, durationTotalMinutes

How to use:
- Group by `Track + Level + ModuleType + Keyword`.
- Select top N courses per keyword for learning path drafts.
- Build curated pathways by level (A1/A2/B1/etc.).

## 2) `all_courses.csv` (inspection history)
Complete audit trail for transparency and governance.

Columns include:
- `timeAdded`, keyword, courseTitle, courseUrl
- rating, ratingCount, courseInstructionalLevel
- durationMinutes, lastUpdated
- status, failureReason

How to use:
- Review rejected items and reasons.
- Spot recurring gaps in keyword quality.
- Keep historical evidence for process and quality reviews.

---

## E) Typical non-technical workflow

1. Update `keywords-list.csv`.
2. Run the tool.
3. Review `top_courses.csv`.
4. Validate/curate with SMEs.
5. Publish final learning paths.
6. Use `all_courses.csv` for audit, retrospectives, and future tuning.

---

## F) Glossary

- **Keyword**: one searchable term extracted from module columns.
- **Track**: career domain or role family.
- **Level**: career-framework progression label (A1, B1, etc.).
- **Module**: a capability area listed under core/AI/softskills.
- **Instructional level**: Udemy course level category (beginner/intermediate/expert).
- **Accepted**: course passed all gates and entered shortlist.
- **Rejected**: course failed one or more gates; reason recorded.
- **Rating count**: number of reviews (used as confidence signal).

