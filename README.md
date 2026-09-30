# WaniKani Burned Items Review

A web app for quizzing yourself on **burned** WaniKani kanji and vocabulary that you've marked with `復習` in their reading note. WaniKani stops reviewing burned items, so this gives the ones you expect to forget their own lightweight review loop. Items that stay correct across several days can be "graduated", and the app removes the tag for you.

**Use it here: https://asa-augustin-17.github.io/wk-custom-burned-review/**

There's nothing to install. It runs entirely in your browser and talks directly to the WaniKani API. There's no backend, and your token and review history stay in your browser.

See [SPEC.md](SPEC.md) for the full behaviour.

## Getting started

1. Create a WaniKani [personal access token](https://www.wanikani.com/settings/personal_access_tokens). A read-only token is enough for reviewing; tick `study_materials:update` if you want the app to remove tags for you.
2. Open the app, paste the token in **Settings**, and press **Validate**.

The app also has a short **Guide** tab.

## Usage

1. On WaniKani, add `復習` to the reading note of burned items you want to keep reviewing. (The tag can be changed in Settings.)
2. Press **Sync now** (sync also runs automatically when the last one is over an hour old).
3. Press **Start review**. Enter submits and moves on, and Backspace wipes an answer so you can retry.
4. Once an item passes on enough separate days (the graduation threshold), remove its tag from the item page or the session end screen.

## Backing up your review history

Your streaks and review counts are stored only in your browser's local storage (IndexedDB), separately for each web address. They are lost if you clear site data, use a private window, switch browsers, or press **Clear all local data**. The hosted app and a local copy (`localhost`) also keep separate histories. WaniKani data itself is safe, since sync re-downloads it.

Don't rely on the browser to keep your history. Save it as a file instead:

- **Download:** Settings → Review history → **Export stats** saves a `wanikani-burned-stats-YYYY-MM-DD.json` file. Do this regularly, for example after each review session, and keep the file somewhere safe (a synced folder works well).
- **Upload:** Settings → Review history → **Import stats…** loads a file back in. Importing merges: for each item the more recent record wins, so uploading an older backup never erases newer progress.

This is also how to move your history to another browser, computer, or between a local copy and the hosted app.

## Development

To run your own copy locally, you need Node.js 20 or newer and git.

```bash
git clone https://github.com/asa-augustin-17/wk-custom-burned-review.git
cd wk-custom-burned-review
npm install
npm run dev
```

Then open http://localhost:5173. The dev server only runs while that terminal is open; stop it with `Ctrl+C`.

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server at http://localhost:5173 |
| `npm test` | Run the unit tests (Vitest) |
| `npm run typecheck` | Type-check with `tsc` |
| `npm run build` | Type-check and build the production site to `dist/` |
| `npm run preview` | Serve the production build locally |

### Deployment

The app is hosted on GitHub Pages. Every push to `main` runs [the deploy workflow](.github/workflows/deploy.yml), which installs dependencies, runs the tests, builds the site, and publishes `dist/`. A failing test stops the deploy.

Production builds are served from `/wk-custom-burned-review/`, set by `base` in [vite.config.ts](vite.config.ts). If the repository is renamed, update that path to match.
