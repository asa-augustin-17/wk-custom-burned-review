# WaniKani Burned Items Review

A local web app for quizzing yourself on **burned** WaniKani kanji and vocabulary that you've marked with `復習` in their reading note. WaniKani stops reviewing burned items, so this gives the ones you expect to forget their own lightweight review loop. Items that stay correct across several days can be "graduated", and the app removes the tag for you.

It runs entirely in your browser and talks directly to the WaniKani API. There's no backend, and your token and review history stay in the browser.

See [SPEC.md](SPEC.md) for the full behaviour.

## Setup

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173, paste a WaniKani [personal access token](https://www.wanikani.com/settings/personal_access_tokens), and press Validate. To use **Remove 復習 tag**, the token needs the `study_materials:update` permission.

## Usage

1. On WaniKani, add `復習` to the reading note of burned items you want to keep reviewing.
2. Press **Sync now** (sync also runs automatically when the last one is over an hour old).
3. Press **Start review**. Enter submits and moves on, and Backspace wipes an answer so you can retry.
4. Once an item passes on enough separate days (the graduation threshold), remove its tag from the item page or the session end screen.

## Backing up your review history

Your streaks and review counts are stored only in this browser's local storage (IndexedDB). They are lost if you clear site data, use a private window, switch browsers, or press **Clear all local data**. WaniKani data itself is safe, since sync re-downloads it.

Don't rely on the browser to keep your history. Save it as a file instead:

- **Download:** Settings → Review history → **Export stats** saves a `wanikani-burned-stats-YYYY-MM-DD.json` file. Do this regularly, for example after each review session, and keep the file somewhere safe (a synced folder works well).
- **Upload:** Settings → Review history → **Import stats…** loads a file back in. Importing merges: for each item the more recent record wins, so uploading an older backup never erases newer progress.

This is also how to move your history to another browser or computer.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit tests (Vitest) |
| `npm run typecheck` | Type-check with `tsc` |
| `npm run build` | Type-check and build to `dist/` |
