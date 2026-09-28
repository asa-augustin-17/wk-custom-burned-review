import type { ReactNode } from 'react';
import type { CachedStudyMaterial, CachedSubject } from '../store/db';
import { Markup } from './Markup';
import { ContextSentences } from './ContextSentences';
import { Readings } from './Readings';

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * Meaning and reading info, laid out like WK. Kanji: meanings and readings only.
 * Vocab: a Meaning section and a Reading section with explanations.
 */
export function SubjectInfo({ subject, studyMaterial }: { subject: CachedSubject; studyMaterial: CachedStudyMaterial | undefined }) {
  const d = subject.data;
  const acceptedMeanings = d.meanings.filter((m) => m.accepted_answer);
  const whitelist = d.auxiliary_meanings.filter((m) => m.type === 'whitelist');
  const readings = d.readings ?? [];
  const wordTypes = d.parts_of_speech ?? [];
  const primary = acceptedMeanings.filter((m) => m.primary).map((m) => m.meaning);
  const alternatives = [...acceptedMeanings.filter((m) => !m.primary).map((m) => m.meaning), ...whitelist.map((m) => m.meaning)];
  const synonyms = studyMaterial?.meaning_synonyms ?? [];
  const meaningRows = (
    <>
      <InfoRow label="Primary">
        <strong>{primary.join(', ')}</strong>
      </InfoRow>
      {alternatives.length > 0 && <InfoRow label="Alternatives">{alternatives.join(', ')}</InfoRow>}
      {synonyms.length > 0 && <InfoRow label="Your synonyms">{synonyms.join(', ')}</InfoRow>}
    </>
  );

  return (
    <>
        {subject.type === 'kanji' ? (
          // Kanji: meanings and readings only.
          <section className="card">
            <div className="answers-grid">
              <div>
                <h2 className="section-title">Meaning</h2>
                {meaningRows}
              </div>
              <div>
                <h2 className="section-title">Readings</h2>
                <Readings subject={subject} />
              </div>
            </div>
          </section>
        ) : (
          // Vocab: WK-style Meaning and Reading sections.
          <>
            <section className="card">
              <h2 className="section-title">Meaning</h2>
              {meaningRows}
              {wordTypes.length > 0 && <InfoRow label="Word type">{wordTypes.join(', ')}</InfoRow>}
              <h3>Explanation</h3>
              <p className="mnemonic">
                <Markup text={d.meaning_mnemonic} />
              </p>
              <h3>Meaning note</h3>
              {studyMaterial?.meaning_note ? <p className="note">{studyMaterial.meaning_note}</p> : <p className="muted">No meaning note.</p>}
            </section>

            {readings.length > 0 && (
              <section className="card">
                <h2 className="section-title">Reading</h2>
                <Readings subject={subject} />
                {d.reading_mnemonic && (
                  <>
                    <h3>Explanation</h3>
                    <p className="mnemonic">
                      <Markup text={d.reading_mnemonic} />
                    </p>
                  </>
                )}
              </section>
            )}
            <ContextSentences subject={d} />
          </>
        )}
    </>
  );
}
