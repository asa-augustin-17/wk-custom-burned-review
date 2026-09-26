import { useEffect, useRef, useState } from 'react';
import { WkApiError, WkClient } from '../api/client';
import { updateReadingNote } from '../api/endpoints';
import { normalize, removeTag } from '../logic/tag';
import { applyUntag, type CachedStudyMaterial } from '../store/db';

const TOKEN_SETTINGS_URL = 'https://www.wanikani.com/settings/personal_access_tokens';

interface Props {
  studyMaterial: CachedStudyMaterial;
  tag: string;
  token: string;
  /** Called after WK and the local cache have both been updated. */
  onUntagged: () => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done' }
  | { kind: 'error'; message: string; permission: boolean };

/** "Remove tag" button with a before/after confirmation dialog. */
export function UntagButton({ studyMaterial, tag, token, onUntagged }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const before = studyMaterial.reading_note ?? '';
  const after = removeTag(before, tag);
  const alsoInMeaningNote = !!studyMaterial.meaning_note && normalize(studyMaterial.meaning_note).includes(normalize(tag));

  useEffect(() => {
    const d = dialogRef.current;
    return () => d?.close();
  }, []);

  async function confirm() {
    setStatus({ kind: 'sending' });
    try {
      const res = await updateReadingNote(new WkClient({ token, maxRetries: 1 }), studyMaterial.id, after);
      await applyUntag({ ...res.data, id: res.id });
      setStatus({ kind: 'done' });
      dialogRef.current?.close();
      onUntagged();
    } catch (e) {
      const permission = e instanceof WkApiError && (e.status === 401 || e.status === 403);
      setStatus({
        kind: 'error',
        permission,
        message: permission
          ? 'WaniKani refused the change. Your API token needs the “study_materials:update” permission. Create a token with that permission enabled, then paste it into Settings.'
          : e instanceof Error
            ? e.message
            : 'Something went wrong.',
      });
    }
  }

  if (status.kind === 'done') return <p className="ok">✓ Tag removed. This item has left your review set.</p>;

  return (
    <>
      <button
        className="danger"
        onClick={() => {
          setStatus({ kind: 'idle' });
          dialogRef.current?.showModal();
        }}
      >
        Remove {tag} tag
      </button>

      <dialog ref={dialogRef} className="untag-dialog" onClose={() => status.kind !== 'sending' && setStatus({ kind: 'idle' })}>
        <h2>Remove the {tag} tag?</h2>
        <p className="muted small">This updates your reading note on WaniKani.</p>
        <div className="note-diff">
          <div>
            <h3>Before</h3>
            <pre className="note-box" lang="ja">{before || ' '}</pre>
          </div>
          <div>
            <h3>After</h3>
            <pre className="note-box" lang="ja">{after || <span className="muted">(empty)</span>}</pre>
          </div>
        </div>
        {alsoInMeaningNote && (
          <p className="muted small">Your meaning note also contains the tag. Only the reading note is changed here.</p>
        )}
        {status.kind === 'error' && (
          <p className="error" role="alert">
            {status.message}{' '}
            {status.permission && (
              <a href={TOKEN_SETTINGS_URL} target="_blank" rel="noreferrer">
                WaniKani API tokens ↗
              </a>
            )}
          </p>
        )}
        <div className="row dialog-actions">
          <button onClick={() => dialogRef.current?.close()} disabled={status.kind === 'sending'}>
            Cancel
          </button>
          <button className="danger" onClick={() => void confirm()} disabled={status.kind === 'sending'} autoFocus>
            {status.kind === 'sending' ? 'Removing…' : 'Remove tag'}
          </button>
        </div>
      </dialog>
    </>
  );
}
