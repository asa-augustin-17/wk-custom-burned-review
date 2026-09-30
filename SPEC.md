# Spec: 復習 Burned-Item Reviewer (WaniKani)

> **Status:** all seven milestones (§10) are built. This spec describes the app as built, including decisions made during development. Where they differ from the original plan, the change is noted.

## 1. Purpose

A local web app that finds my **burned** WaniKani **kanji and vocabulary** whose **reading note** contains the tag `復習`, and lets me quiz myself on them. I add the tag by hand to burned items I expect to forget. WaniKani doesn't schedule reviews for burned items, so this app provides its own lightweight review loop.

It is a static site hosted on GitHub Pages at https://asa-augustin-17.github.io/wk-custom-burned-review/, so users only need a browser and a WaniKani token. It talks directly to the WaniKani API v2 from the browser and stores everything client-side. There is no backend. It can also be run locally with `npm run dev` for development.

Radicals are out of scope (I never review them). They are ignored even when tagged.

## 2. Instructions for Claude Code

- Build in milestone order (§10), stopping after each milestone for me to test.
- Read §4 (API facts) before writing any API code. Don't guess endpoint shapes. If something in this spec contradicts the live API, trust the API, then tell me what differed.
- Keep dependencies minimal. Ask before adding anything not listed in §3.
- Write unit tests for the pure logic: answer checking, tag matching, untag text transform, scheduler, stats import/export.
- Never log or commit the API token.

## 3. Tech stack

- Vite + React + TypeScript (strict mode)
- `wanakana` for romaji→kana input conversion and kana normalization
- `idb-keyval` for IndexedDB persistence (cached API data and review stats)
- Vitest for unit tests
- Plain CSS with CSS variables, including light and dark themes via `prefers-color-scheme` plus a manual toggle. No UI framework.
- Hosting: GitHub Pages (static files). A GitHub Actions workflow runs the tests, builds, and deploys on every push to `main`; a failing test stops the deploy. Production builds use the base path `/wk-custom-burned-review/`.

## 4. WaniKani API v2 facts

- Base URL: `https://api.wanikani.com/v2`
- Required headers on every request:
  - `Authorization: Bearer <token>`
  - `Wanikani-Revision: 20170710`
- Collections are paginated. Follow `pages.next_url` until it is `null`. Resource data is in `data[]`, with each item's fields under `.data`.
- Rate limit: 60 requests per minute. On HTTP 429, wait until the `RateLimit-Reset` header time (Unix seconds) and retry. If the header can't be read (CORS), wait 60 s. Requests are spaced about 1.1 s apart.
- Filters used:
  - `GET /study_materials?updated_after=<ISO8601>`. There is no text search, so filtering happens on the client.
  - `GET /assignments?subject_ids=1,2,3`. **Not** `burned=true` (see below).
  - `GET /subjects?ids=1,2,3`
  - ID lists are chunked to 100 per request.
- `GET /user` validates the token and gives the username for the header.
- Update a note: `PUT /study_materials/<study_material_id>` with body `{"study_material": {"reading_note": "<new text>"}}`. This requires a token with the `study_materials:update` permission. A read-only token fails with 401 or 403.
- **Burned status (differs from original spec):** WaniKani keeps `burned_at` after an item is resurrected and sets `resurrected_at`, so the `burned=true` filter also returns resurrected items. An item counts as burned only when its assignment is at **SRS stage 9** and not hidden.
- Relevant fields:
  - **study_material**: `subject_id`, `subject_type`, `reading_note`, `meaning_note`, `meaning_synonyms[]`, `hidden`
  - **assignment**: `subject_id`, `srs_stage`, `burned_at`, `resurrected_at`, `hidden`
  - **subject**: `characters`, `meanings[]` with `{meaning, primary, accepted_answer}`, `auxiliary_meanings[]` with `{meaning, type: "whitelist" | "blacklist"}`, `readings[]` with `{reading, primary, accepted_answer, type?}`, `parts_of_speech[]` (vocabulary), `meaning_mnemonic`, `reading_mnemonic` (may contain WK markup tags like `<kanji>`), `document_url`, `level`
  - Reading `type` (`onyomi` / `kunyomi` / `nanori`) exists only on kanji readings. Vocabulary readings have no type.
  - Subject types in scope: `kanji`, `vocabulary`, `kana_vocabulary`. Kana vocabulary has no readings.

## 5. Features

### 5.1 Header, setup and settings

- Header: the pink **復習** logo and the title "WaniKani Burned Items Review", the username, a theme toggle (◐ system → ☀ light → ☾ dark), and Home / Guide / Settings.
- **Guide** tab: a short first-time user guide (what the app does, getting started, reviewing keys, graduation, backups, the app's web address). It's reachable before a token is set, and the first-run welcome note links to it.
- First run shows a welcome note and the settings screen with a password-type token input, a "Validate" button that calls `/user`, and a note saying the token is stored in this browser's localStorage.
- Settings:
  - **Reading tag string**: default `復習`
  - **Also search meaning notes**: default off
  - **Session size**: default 20, allowed range 5–100
  - **Graduation threshold**: consecutive correct sessions on distinct days, default 5
  - **Theme**: system, light, or dark
  - Number fields accept free typing (including an empty box) and are validated and clamped only on blur or Enter.
  - The original "Quiz meaning too" setting was removed. The quiz always tests both reading and meaning.
- **Review history**: export stats to a JSON file, and import one (see §7).
- **Local data**: a "Clear all local data" button with a confirmation step.

### 5.2 Sync

1. Fetch study materials. First sync fetches everything. Later syncs pass `updated_after = lastSyncedAt` and merge the results into the cache.
2. Tagged set = non-radical study materials where the NFKC-normalized `reading_note` (plus `meaning_note` if that setting is on) contains the NFKC-normalized tag. Study materials where `hidden` is true are skipped.
3. Fetch assignments for the tagged subject IDs (no `burned` filter). The **target set** is the tagged IDs whose assignment is at SRS stage 9 and not hidden (§4).
4. Fetch subjects for every tagged item (not only burned ones, so the tagged-but-not-burned list can show them) that aren't cached yet. Refetch cached subjects older than 30 days.
5. Store `lastSyncedAt` as the time the sync *started*, so nothing slips through during the run.
6. Show sync progress ("Fetching study materials… page 2"), the request count, and a summary: total tagged, tagged and burned, and tagged but not burned. The tagged-but-not-burned list shows each item with a status: "Resurrected <date>", "Not yet burned", "Not started", or "Hidden".
- Sync runs automatically on app load if the last sync was more than 1 hour ago, and on demand from a Sync now button.
- If a token for a different WaniKani account is validated, the cached WK data is cleared.

### 5.3 Dashboard, item list and detail view

- The **Sync** box sits at the top of the dashboard.
- **Review card**: target item count, "in next session" count, and "graduated X / N", plus a Start review button.
- **Progress to graduation** (in the Review card): a stacked bar and one clickable column per streak bucket (Not reviewed, Streak 0 up to threshold − 1, Graduated), with a summary line. The type filter scopes it, and clicking a column filters the item list to that streak (shown as a clearable chip).
- **Type counts**: kanji and vocabulary counts. Clicking one filters the item list to that type; clicking again clears the filter.
- **Item list**: characters, primary meaning, primary reading, level, streak, and last reviewed date. It can be searched, filtered by type, and sorted by item, meaning, reading, level, streak, or last reviewed, by clicking a column header (again to reverse) or with the sort controls. Rows open the detail view on click or Enter. On narrow screens, Level and Last reviewed are hidden.
- **Detail view** (Esc goes back), laid out like WaniKani's pages:
  - **Kanji**: one box with the meanings (primary and alternatives) and the readings grouped under On'yomi, Kun'yomi, and Nanori (when present). The group WK doesn't accept is dimmed, and the primary reading is bold. Kanji show no mnemonics and no meaning note.
  - **Vocabulary**: a **Meaning** box (primary, alternatives, your synonyms, word type, explanation, meaning note) and a **Reading** box (readings, explanation). For vocabulary, WK's mnemonics are labelled "explanation". "Mnemonic" is reserved for kanji. A **Context** box shows WK's context sentences (Japanese, with English below).
  - The reading note is not shown in the detail view.
  - Below: your review stats, a "Remove 復習 tag" button for graduated items still in the review set (§5.6), and a link to `document_url`.

### 5.4 Quiz

- Show the item large, colour-coded by type the way WK does (kanji pink, vocab purple), with a prompt label bar: "Reading" (dark) or "Meaning" (light).
- Each kanji and vocabulary item gets a reading prompt and a meaning prompt. Kana vocabulary gets meaning only.
- Input:
  - Reading prompts bind `wanakana.bind(input, { IMEMode: true })` for IME-style kana conversion.
  - Meaning prompts use plain text input.
- **Enter** submits. After a graded answer:
  - **Correct**: show the accepted answers for that prompt (grouped readings for kanji) and, for vocabulary, the relevant explanation and context sentences.
  - **Incorrect**: show all the item's meaning and reading info (the same content as the detail view).
  - A link to the item's WK page.
  - The reading note is not shown on the quiz.
- **Enter** again (or the clickable **Next**) moves to the next prompt. The answer is recorded only at this point. The footer reads "Next Enter · Retry Backspace · WaniKani page".
- **Backspace** after any graded answer wipes it, and the prompt can be answered again as if never submitted (like the WK DoubleCheck userscript). This covers typos and lucky matches. There is no "mark correct" override.
- "End session" (or navigating away) asks for confirmation. Unfinished items aren't counted.
- The session end screen shows accuracy, items passed, the items missed, and any items that reached the graduation threshold (each with a Remove tag button). Enter returns to the dashboard.

### 5.5 Answer checking (pure functions, fully tested)

- **Reading**: convert the input (romaji, hiragana, or katakana) to hiragana with `wanakana.toHiragana`, remove whitespace, and compare against each `readings[]` entry where `accepted_answer` is true (also converted to hiragana). A trailing single "n" is handled.
  - If the input matches a non-accepted reading, don't grade it. Shake the input and name the wanted reading type when it's unambiguous ("WaniKani wants the on'yomi reading.").
  - If the input is the item's meaning (including half-converted input such as "びg" for "big"), shake with "That's the meaning. We want the reading."
  - If the input isn't kana, shake with "Answer the reading in kana."
- **Meaning**: NFKC, lowercase, hyphens and slashes treated as spaces, strip other punctuation, collapse whitespace, trim. Correct if it matches an accepted meaning, a whitelist auxiliary meaning, or one of my `meaning_synonyms`. Blacklisted auxiliary meanings are always wrong.
  - Typo tolerance when there's no exact match: Levenshtein distance ≤ 1 for accepted answers of 4–7 characters, ≤ 2 for 8 or more, and none for 3 or fewer. Show "Close enough: <matched answer>". A near-miss that is at least as close to a blacklisted meaning is wrong.
  - If the input is the item's reading (in kana or romaji), shake with "That's the reading. We want the meaning." Other Japanese text shakes with "Answer the meaning in English."
- Empty input shakes and is never graded.

### 5.6 Untag

- On the detail view (graduated items in the review set) and the session end screen (newly graduated items), a "Remove 復習 tag" button opens a confirmation dialog showing the reading note before and after.
- The transform (a pure, tested function) removes every occurrence of the tag (including NFKC-compatible forms), drops lines that held only the tag, collapses spaces left by the removal and runs of blank lines, and trims. Lines without the tag are left untouched.
- On success, update the cached study material and remove the item from the target set. On 401 or 403, explain that the token needs the `study_materials:update` permission and link to the WK API token settings page. If the tag is also in the meaning note, the dialog says only the reading note is changed.

## 6. Scheduling

This is not a full SRS. The goal is to surface shaky items more often.

**Per-item stats**, stored in IndexedDB and keyed by `subject_id`:

```ts
interface ItemStats {
  subjectId: number;
  timesReviewed: number;   // sessions in which the item was completed
  timesCorrect: number;    // sessions passed
  timesIncorrect: number;  // sessions failed
  streak: number;          // consecutive passed sessions on distinct days
  lastReviewedAt: string | null;
  lastStreakDay: string | null; // YYYY-MM-DD (local), prevents same-day streak inflation
}
```

**Session selection:** from the target set, order by
1. never reviewed first,
2. then lowest streak,
3. then oldest `lastReviewedAt`.

Take `sessionSize` items and shuffle within the selection.

**Within a session:**
- Shuffle all prompts, keeping an item's two prompts at least 2 positions apart (never adjacent) where possible.
- A missed prompt is reinserted 3–5 positions later (2–4 other prompts come before it again), or at the end if fewer remain.
- An item **passes** the session if every one of its prompts was answered correctly with no misses. An item with any miss **fails**, even though it was eventually completed. A retried (Backspace) answer doesn't count as a miss.

**After each item completes** (recorded as soon as its last prompt is committed, so closing the tab mid-session keeps finished items):
- **Pass**: if `lastStreakDay` isn't today, increment `streak` and set `lastStreakDay` to today.
- **Fail**: reset `streak` to 0.
- An item is a **graduation candidate** when `streak ≥ graduationThreshold`.

## 7. Data persistence

- **localStorage**: `wkb.token`, `wkb.settings`.
- **IndexedDB** keys:
  - `studyMaterials` (map by subject_id, including the study material `id` needed for PUT)
  - `subjects` (map by id, with `type` and a `fetchedAt` timestamp)
  - `targetIds`
  - `taggedNotBurnedIds`
  - `assignments` (status per tagged subject: `srs_stage`, `burned_at`, `resurrected_at`, `hidden`)
  - `lastSyncedAt`
  - `cacheOwner` (username the cache belongs to)
  - `stats` (map by subject_id)
  - `version` (schema version, with a simple migration hook)
- **Stats export/import**: export writes `{ format: "wanikani-burned-stats", version, exportedAt, stats }`. Import validates the file, skips malformed entries, and merges: per item, the record with the later `lastReviewedAt` wins (ties go to more `timesReviewed`), so importing an old backup never erases newer history.

## 8. Project structure

```
src/
  api/        client.ts (fetch wrapper: headers, pagination, spacing, 429 retry), endpoints.ts
  sync/       sync.ts, useSync.ts
  logic/      answers.ts, tag.ts, scheduler.ts, progress.ts, markup.ts, statsio.ts, subject.ts   ← pure, unit tested
  store/      db.ts, settings.ts
  ui/         Settings, Guide, Dashboard, SyncPanel, ProgressPanel, ItemList, ItemDetail, SubjectInfo,
              Readings, ContextSentences, Markup, SubjectGlyph, Quiz, SessionEnd, UntagButton
  styles/     theme.css
  App.tsx, main.tsx
.github/workflows/deploy.yml   ← test, build, and deploy to GitHub Pages
```

## 9. Non-goals

- Radicals.
- Submitting reviews to WaniKani or resurrecting items through the API. Resurrection happens on the WK website, and the app just links there.
- Multi-device sync or any backend. Hosting stays static; review history lives in each browser (export/import moves it).

## 10. Milestones

All complete.

1. **Scaffold and API client.** Token settings screen, `/user` validation, fetch wrapper with pagination, rate limits, and 429 handling.
2. **Sync.** The §5.2 flow with progress and summary, cached in IndexedDB, with incremental sync.
3. **Dashboard, item list, and detail view** (§5.3), with markup rendering.
4. **Answer checking** (§5.5) with Vitest coverage.
5. **Quiz and scheduler** (§5.4, §6), including stats updates, the session end screen, keyboard-only operation, and an injectable clock for streak tests.
6. **Untag** (§5.6), with confirmation and permission-error handling.
7. **Polish.** Theme toggle, stats export and import, empty states (no token, first sync, no tagged items, all graduated), and responsive layout.
