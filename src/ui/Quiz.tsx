import { useEffect, useMemo, useRef, useState } from 'react';
import { bind, unbind } from 'wanakana';
import { acceptedMeanings, checkAnswer, type CheckResult } from '../logic/answers';
import { answerCurrent, isSessionDone, startSession, type SessionState } from '../logic/scheduler';
import { TYPE_LABEL } from '../logic/subject';
import type { StudyMaterialMap, SubjectMap } from '../store/db';
import { Markup } from './Markup';
import { Readings } from './Readings';
import { ContextSentences } from './ContextSentences';
import { SubjectInfo } from './SubjectInfo';

export interface SessionResult {
  finished: { subjectId: number; passed: boolean }[];
  answersCorrect: number;
  answersIncorrect: number;
  /** Items in the session that were never completed (session ended early). */
  unfinishedIds: number[];
}

interface Props {
  sessionIds: number[];
  subjects: SubjectMap;
  studyMaterials: StudyMaterialMap;
  onItemDone: (subjectId: number, passed: boolean) => void;
  onFinish: (result: SessionResult) => void;
}

type Graded = Extract<CheckResult, { kind: 'correct' | 'incorrect' }>;

const toResult = (s: SessionState, sessionIds: number[]): SessionResult => {
  const done = new Set(s.finished.map((f) => f.subjectId));
  return {
    finished: s.finished,
    answersCorrect: s.answersCorrect,
    answersIncorrect: s.answersIncorrect,
    unfinishedIds: sessionIds.filter((id) => !done.has(id)),
  };
};

export function Quiz({ sessionIds, subjects, studyMaterials, onItemDone, onFinish }: Props) {
  const [session, setSession] = useState<SessionState>(() =>
    startSession(sessionIds.map((id) => ({ subjectId: id, hasReading: (subjects[id]?.data.readings?.length ?? 0) > 0 }))),
  );
  /** Session before the graded answer on screen; Backspace restores it to retry. */
  const [before, setBefore] = useState<SessionState | null>(null);
  const [graded, setGraded] = useState<Graded | null>(null);
  /** Item completed by the answer on screen. Recorded only on Enter, so a retry can't leave stale stats. */
  const [pending, setPending] = useState<{ subjectId: number; passed: boolean } | null>(null);
  const [shake, setShake] = useState<{ message: string; n: number } | null>(null);
  const [promptNo, setPromptNo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Restart the shake animation on every rejected (ungraded) submit, without remounting the input.
  useEffect(() => {
    const el = rowRef.current;
    if (!el || !shake) return;
    el.classList.remove('shaking');
    void el.offsetWidth;
    el.classList.add('shaking');
  }, [shake]);

  // While an answer is shown, the prompt being displayed is the one that was answered.
  const shownPrompt = (before ?? session).queue[0];
  const subject = shownPrompt ? subjects[shownPrompt.subjectId] : undefined;
  const sm = shownPrompt ? studyMaterials[shownPrompt.subjectId] : undefined;
  const kind = shownPrompt?.kind;

  // IME-style kana conversion on reading prompts. The input remounts per attempt (key), so bind once per mount.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (kind !== 'reading') return;
    bind(el, { IMEMode: true });
    return () => unbind(el);
  }, [promptNo, kind]);

  const total = sessionIds.length;
  const answered = session.answersCorrect + session.answersIncorrect;
  const accuracy = answered ? Math.round((session.answersCorrect / answered) * 100) : 100;

  function submit() {
    if (!shownPrompt || !subject || graded) return;
    const value = inputRef.current?.value ?? '';
    const res = checkAnswer(shownPrompt.kind, value, subject.data, sm?.meaning_synonyms ?? []);
    if (res.kind === 'shake') {
      setShake({ message: res.message, n: (shake?.n ?? 0) + 1 });
      return;
    }
    setShake(null);
    const out = answerCurrent(session, res.kind === 'correct');
    setBefore(session);
    setSession(out.state);
    setGraded(res);
    setPending(out.completed ?? null);
  }

  /** Wipes the graded answer and lets the prompt be answered again (like WK's DoubleCheck script). */
  function retry() {
    if (!before || !graded) return;
    setSession(before);
    setBefore(null);
    setGraded(null);
    setPending(null);
    setShake(null);
    setPromptNo((n) => n + 1);
  }

  function commitPending() {
    if (pending) onItemDone(pending.subjectId, pending.passed);
    setPending(null);
  }

  function next() {
    commitPending();
    if (isSessionDone(session)) {
      onFinish(toResult(session, sessionIds));
      return;
    }
    setBefore(null);
    setGraded(null);
    setShake(null);
    setPromptNo((n) => n + 1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (graded) next();
      else submit();
    } else if (e.key === 'Backspace' && graded) {
      e.preventDefault();
      retry();
    }
  }

  function endEarly() {
    if (window.confirm('End this session? Items you haven’t finished won’t be counted.')) {
      commitPending();
      onFinish(toResult(session, sessionIds));
    }
  }

  const accepted = useMemo(() => {
    if (!subject || kind !== 'meaning') return [];
    return acceptedMeanings(subject.data, sm?.meaning_synonyms ?? []);
  }, [subject, kind, sm]);

  if (!shownPrompt || !subject) return null;
  const explanation = kind === 'reading' ? subject.data.reading_mnemonic : subject.data.meaning_mnemonic;

  return (
    <div className="quiz">
      <div className="quiz-bar">
        <span>
          {session.finished.length} / {total} items
        </span>
        <span>{accuracy}% correct</span>
        <button className="link-button" onClick={endEarly}>
          End session
        </button>
      </div>

      <section className={`quiz-item ${subject.type}`}>
        <span className="quiz-glyph" lang="ja">
          {subject.data.characters ?? subject.data.slug}
        </span>
      </section>

      <div className={`prompt-label ${kind}`}>
        {TYPE_LABEL[subject.type]} <strong>{kind === 'reading' ? 'Reading' : 'Meaning'}</strong>
      </div>

      <div className="answer-row" ref={rowRef}>
        <input
          key={promptNo}
          ref={inputRef}
          className={`answer-input ${graded ? graded.kind : ''}`}
          lang={kind === 'reading' ? 'ja' : 'en'}
          placeholder={kind === 'reading' ? '答え' : 'Your response'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          readOnly={!!graded}
          onKeyDown={onKeyDown}
          aria-label={kind === 'reading' ? 'Reading answer' : 'Meaning answer'}
        />
      </div>
      {shake?.message && (
        <p className="shake-message" role="alert">
          {shake.message}
        </p>
      )}

      {graded && (
        <div className="answer-panel">
          <p className={`verdict ${graded.kind}`} role="status">
            {graded.kind === 'correct' ? (graded.closeEnough ? `Close enough: ${graded.matched}` : 'Correct') : 'Incorrect'}
          </p>

          {graded.kind === 'incorrect' ? (
            // Wrong: show everything about the item.
            <SubjectInfo subject={subject} studyMaterial={sm} />
          ) : (
            <>
              <div className="card">
                <h3>{kind === 'reading' ? 'Accepted readings' : 'Accepted meanings'}</h3>
                {kind === 'reading' ? <Readings subject={subject} /> : <p className="accepted">{accepted.join(', ')}</p>}
              </div>

              {subject.type !== 'kanji' && explanation && (
                <div className="card">
                  <h3>{kind === 'reading' ? 'Reading explanation' : 'Meaning explanation'}</h3>
                  <p className="mnemonic">
                    <Markup text={explanation} />
                  </p>
                </div>
              )}
              <ContextSentences subject={subject.data} />
            </>
          )}

          <p className="quiz-help muted small">
            <button className="link-button" onClick={next}>
              {isSessionDone(session) ? 'Finish' : 'Next'}
            </button>{' '}
            <kbd>Enter</kbd>
            {' · '}
            <button className="link-button" onClick={retry}>
              Retry
            </button>{' '}
            <kbd>Backspace</kbd>
            {' · '}
            <a href={subject.data.document_url} target="_blank" rel="noreferrer">
              WaniKani page ↗
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
