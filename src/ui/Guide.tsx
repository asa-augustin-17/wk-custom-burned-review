const TOKEN_URL = 'https://www.wanikani.com/settings/personal_access_tokens';

interface Props {
  tag: string;
  threshold: number;
}

/** A short first-time user guide. Must-know information only. */
export function Guide({ tag, threshold }: Props) {
  return (
    <div className="guide">
      <section className="card">
        <h2>What this app does</h2>
        <p>
          WaniKani stops reviewing items once they’re burned. This app lets you keep reviewing the burned kanji and
          vocabulary you’re afraid of forgetting. You choose them by adding <strong lang="ja">{tag}</strong> to their
          reading note on WaniKani.
        </p>
        <p className="muted small">
          Prefer a different tag? Change <strong>Reading tag string</strong> in Settings to any text you like, then press{' '}
          <strong>Sync now</strong> on the Home tab.
        </p>
      </section>

      <section className="card">
        <h2>Getting started</h2>
        <ol className="guide-steps">
          <li>
            Create a personal access token on{' '}
            <a href={TOKEN_URL} target="_blank" rel="noreferrer">
              WaniKani’s API tokens page
            </a>
            . Tick <em>study_materials:update</em> so that the app can update reading note tags for you later.
          </li>
          <li>
            Paste it in <strong>Settings</strong> and press <strong>Validate</strong>.
          </li>
          <li>
            On WaniKani, open a burned item and add <strong lang="ja">{tag}</strong> anywhere in its{' '}
            <strong>reading note</strong>.
          </li>
          <li>
            Back here, press <strong>Sync now</strong> on the Home tab. Tagged items appear in your list.
          </li>
        </ol>
      </section>

      <section className="card">
        <h2>Reviewing</h2>
        <p>
          Press <strong>Start review</strong>. Each item asks for its reading and its meaning. Type in romaji for
          readings; it turns into kana as you type.
        </p>
        <table className="guide-keys">
          <tbody>
            <tr>
              <td>
                <kbd>Enter</kbd>
              </td>
              <td>Submit your answer, then go to the next one</td>
            </tr>
            <tr>
              <td>
                <kbd>Backspace</kbd>
              </td>
              <td>After answering, wipe it and try again (for typos)</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          If the input shakes, you weren’t marked wrong. You typed the reading instead of the meaning (or the other way
          round), or a reading WaniKani doesn’t want.
        </p>
      </section>

      <section className="card">
        <h2>Graduating items</h2>
        <p>
          An item passes a session when you get every prompt right with no misses. Pass it on{' '}
          <strong>{threshold} different days</strong> and it graduates. Then you can remove its{' '}
          <strong lang="ja">{tag}</strong> tag from the item’s page, and it leaves your review list. A miss resets its
          streak to 0.
        </p>
        <p className="muted small">
          You can change the number of days with <strong>Graduation threshold</strong> in Settings. The Home tab shows
          how many items sit at each streak.
        </p>
      </section>

      <section className="card">
        <h2>Keep a backup</h2>
        <p>
          Your review history is saved only in this browser. Clearing browser data erases it. Use{' '}
          <strong>Settings → Export stats</strong> now and then, and <strong>Import stats</strong> to restore it.
        </p>
      </section>
    </div>
  );
}
