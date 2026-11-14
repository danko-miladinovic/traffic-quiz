"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  PracticeCategory,
  PracticeFeedback,
  PracticeQuestionView,
  PracticeView,
} from "@duel/domain/practice";
import { Button } from "./button";

const attemptKey = "duel.practice.attempt";
const intentKey = "duel.practice.start";
type Intent = { categoryKey: string; requestId: string };
type Answer = { questionId: string; optionKey: string };
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/practice${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(result.error?.message ?? "Zahtev nije uspeo.", response.status);
  return result as T;
}
function read(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* Practice works without resume storage. */
  }
}
function readIntent(): Intent | null {
  try {
    const value = JSON.parse(read(intentKey) ?? "null") as Intent | null;
    if (value && typeof value.categoryKey === "string" && typeof value.requestId === "string")
      return value;
  } catch {
    /* Invalid tab-local storage must not prevent practice. */
  }
  store(intentKey, null);
  return null;
}
function message(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Veza je prekinuta ili je server spor. Pokušaj ponovo — prihvaćen odgovor neće biti upisan dvaput.";
}

export function Practice() {
  const [categories, setCategories] = useState<PracticeCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState<PracticeView | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState(false);
  const [pending, setPending] = useState<Answer | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef(false);

  function accept(view: PracticeView, showFeedback = !view.completed && !!view.feedback) {
    setAttempt(view);
    setReviewing(showFeedback);
    setSelected("");
    setPending(null);
    setIntent(null);
    setResumeId(null);
    setError(null);
    setTerminal(false);
    store(attemptKey, view.id);
    store(intentKey, null);
    focusNext.current = true;
  }
  function fail(error: unknown) {
    setError(message(error));
    if (error instanceof ApiError && [401, 404, 410].includes(error.status)) setTerminal(true);
  }
  async function loadCategories() {
    const result = await api<{ categories: PracticeCategory[] }>("/categories");
    setCategories(result.categories);
    setLoaded(true);
    const savedIntent = readIntent();
    const savedAttempt = read(attemptKey);
    if (savedIntent) await create(savedIntent);
    else if (savedAttempt) {
      setResumeId(savedAttempt);
      await recover(savedAttempt);
    }
  }
  async function recover(id: string) {
    await api("/session", {});
    accept(await api<PracticeView>(`/attempts/${id}`));
  }
  async function create(nextIntent: Intent) {
    setIntent(nextIntent);
    store(intentKey, JSON.stringify(nextIntent));
    await api("/session", {});
    accept(await api<PracticeView>("/attempts", nextIntent));
  }
  async function run(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (error) {
      fail(error);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      locked.current = true;
      try {
        const result = await api<{ categories: PracticeCategory[] }>("/categories");
        if (cancelled) return;
        setCategories(result.categories);
        setLoaded(true);
        const savedIntent = readIntent();
        const savedAttempt = read(attemptKey);
        if (savedIntent) {
          setIntent(savedIntent);
          await api("/session", {});
          const view = await api<PracticeView>("/attempts", savedIntent);
          if (!cancelled) accept(view);
        } else if (savedAttempt) {
          setResumeId(savedAttempt);
          await api("/session", {});
          const view = await api<PracticeView>(`/attempts/${savedAttempt}`);
          if (!cancelled) accept(view);
        }
      } catch (error) {
        if (!cancelled) fail(error);
      } finally {
        if (!cancelled) {
          setBusy(false);
          locked.current = false;
        }
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (focusNext.current && !busy) {
      heading.current?.focus();
      focusNext.current = false;
    }
  }, [attempt, reviewing, busy]);

  function reset() {
    store(attemptKey, null);
    store(intentKey, null);
    setAttempt(null);
    setSelected("");
    setReviewing(false);
    setPending(null);
    setIntent(null);
    setResumeId(null);
    setError(null);
    setTerminal(false);
    focusNext.current = true;
  }
  function start(categoryKey: string) {
    void run(() => create({ categoryKey, requestId: crypto.randomUUID() }));
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!attempt?.current) return;
    const answer = pending ?? { questionId: attempt.current.id, optionKey: selected };
    if (!answer.optionKey) return;
    setPending(answer);
    void run(async () => {
      try {
        accept(await api<PracticeView>(`/attempts/${attempt.id}/answers`, answer), true);
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) setPending(null);
        throw error;
      }
    });
  }
  function next() {
    setReviewing(false);
    setSelected("");
    focusNext.current = true;
  }

  const feedback = reviewing ? attempt?.feedback : null;
  const current = feedback?.question ?? attempt?.current;
  const results = attempt?.completed && !reviewing ? attempt.result : null;
  return (
    <section className="container practice-page" aria-busy={busy}>
      <div className="practice-heading">
        <div>
          <p className="eyebrow">SRBIJA · B KATEGORIJA</p>
          <h1>
            Vežbaj. Razumi.
            <br />
            <span>Zapamti.</span>
          </h1>
        </div>
        <p>
          Bez prijave. Bez žurbe.
          <br />
          Svaki odgovor je prilika za učenje.
        </p>
      </div>
      {attempt?.demo && (
        <aside className="demo-notice">
          Tehnička proba · Sintetička pitanja za proveru interfejsa. Ovo nije priprema za vozački
          ispit.
        </aside>
      )}
      {error && (
        <div className="practice-error" role="alert" aria-label="Greška pri vežbanju">
          <p>{error}</p>
          <div className="practice-actions">
            {terminal ? (
              <Button onClick={reset}>Novo vežbanje</Button>
            ) : (
              <>
                {!loaded && (
                  <Button disabled={busy} onClick={() => void run(loadCategories)}>
                    Pokušaj ponovo
                  </Button>
                )}
                {intent && (
                  <Button disabled={busy} onClick={() => void run(() => create(intent))}>
                    Ponovi pokretanje
                  </Button>
                )}
                {(attempt || resumeId) && (
                  <Button
                    disabled={busy}
                    onClick={() => void run(() => recover(attempt?.id ?? resumeId!))}
                  >
                    Proveri sačuvano stanje
                  </Button>
                )}
                {(intent || resumeId) && !attempt && (
                  <button className="text-link" disabled={busy} onClick={reset}>
                    Odustani od ovog pokušaja
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {busy && (
        <p className="practice-loading" role="status">
          {attempt ? "Čuvamo tvoj napredak…" : "Pripremamo vežbanje…"}
        </p>
      )}
      {!attempt && loaded && !intent && !resumeId && !terminal && (
        <>
          <div className="practice-section-heading">
            <h2 ref={heading} tabIndex={-1}>
              Izaberi oblast
            </h2>
            <p>Do 5 pitanja po pokušaju · Objašnjenje posle svakog odgovora</p>
          </div>
          {!categories.some((category) => !category.demo && category.count > 0) && (
            <div className="notice">
              <h3>Pitanja su na proveri</h3>
              <p>
                Još nema objavljenih pitanja. Vežbanje će biti dostupno kada sadržaj prođe stručnu
                proveru.
              </p>
            </div>
          )}
          <div className="practice-category-grid">
            {categories.map((category, index) => (
              <article
                className={`practice-category ${category.demo ? "practice-category-demo" : ""}`}
                key={category.key}
              >
                <span className="topic-number">/{String(index + 1).padStart(2, "0")}</span>
                <p className="eyebrow">
                  {category.demo ? "RAZVOJNA VERZIJA" : "VEŽBANJE PO OBLASTI"}
                </p>
                <h3>{category.title}</h3>
                <p>{category.description}</p>
                <div className="practice-category-bottom">
                  <span>{category.count ? `${category.count} pitanja` : "Na proveri"}</span>
                  <Button disabled={busy || !category.count} onClick={() => start(category.key)}>
                    {category.count ? "Započni →" : "U pripremi"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {attempt && !terminal && (
        <div className="practice-workspace">
          <div className="practice-meta">
            <span>{attempt.categoryTitle}</span>
            <span>
              {attempt.answered} / {attempt.total} odgovoreno
            </span>
          </div>
          <progress
            className="practice-progress"
            max={attempt.total}
            value={attempt.answered}
            aria-label="Odgovorena pitanja"
          />
          {results ? (
            <div className="practice-results">
              <p className="eyebrow">VEŽBANJE JE ZAVRŠENO</p>
              <h2 ref={heading} tabIndex={-1}>
                Svaki pokušaj je korak napred.
              </h2>
              <p className="practice-score">
                <strong>
                  {results.correct}
                  <span>/{attempt.total}</span>
                </strong>
                <span>{results.percent}% tačnih odgovora</span>
              </p>
              <p>
                {results.correct === attempt.total
                  ? "Odlično! Svi odgovori su tačni."
                  : "Pogledaj objašnjenja i obrati pažnju na pitanja koja su ti bila teža."}
              </p>
              <div className="practice-actions">
                <Button disabled={busy} onClick={() => start(attempt.categoryKey)}>
                  Vežbaj ponovo ↗
                </Button>
                <button className="text-link" disabled={busy} onClick={reset}>
                  Izaberi drugu oblast
                </button>
              </div>
              <h3>Pregled odgovora</h3>
              <div className="practice-review-list">
                {results.answers.map((answer, index) => (
                  <details key={answer.question.id}>
                    <summary>
                      <span className={answer.correct ? "answer-good" : "answer-bad"}>
                        {answer.correct ? "✓ Tačno" : "✕ Netačno"}
                      </span>{" "}
                      {index + 1}. {answer.question.prompt}
                    </summary>
                    <Feedback answer={answer} />
                  </details>
                ))}
              </div>
            </div>
          ) : (
            current && (
              <div className="practice-question">
                <p className="eyebrow">
                  PITANJE {current.position + 1} OD {attempt.total}
                </p>
                <h2 ref={heading} tabIndex={-1}>
                  {current.prompt}
                </h2>
                {current.image && (
                  <div className="practice-image">
                    <img
                      src={current.image.path}
                      alt={current.image.alt}
                      width="320"
                      height="240"
                    />
                  </div>
                )}
                {feedback ? (
                  <>
                    <Options question={current} feedback={feedback} />
                    <div
                      className={`practice-feedback ${feedback.correct ? "feedback-good" : "feedback-bad"}`}
                      role="status"
                    >
                      <h3>
                        {feedback.correct ? "✓ Tačan odgovor" : "Još jedna prilika da naučiš"}
                      </h3>
                      <Feedback answer={feedback} />
                    </div>
                    <Button disabled={busy} onClick={next}>
                      {attempt.completed ? "Pogledaj rezultat →" : "Sledeće pitanje →"}
                    </Button>
                  </>
                ) : (
                  <form onSubmit={submit}>
                    <fieldset disabled={busy || !!pending}>
                      <legend className="sr-only">Izaberi jedan odgovor</legend>
                      <Options question={current} selected={selected} onSelect={setSelected} />
                    </fieldset>
                    <p className="practice-hint">
                      Jedan odgovor je tačan. Nema vremenskog ograničenja.
                    </p>
                    <div className="practice-actions">
                      <Button disabled={busy || (!selected && !pending)} type="submit">
                        {pending ? "Ponovi slanje" : "Potvrdi odgovor →"}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )
          )}
          <button className="text-link practice-leave" disabled={busy} onClick={reset}>
            Vrati se na izbor oblasti
          </button>
        </div>
      )}
      <p className="practice-privacy">
        Napredak se čuva uz privatnu sesiju u ovom pregledaču. Ne tražimo ime ni nalog.{" "}
        <Link href="/o-projektu">O privatnosti</Link>
      </p>
      <noscript>
        Za interaktivno vežbanje je potreban JavaScript. Informacije o projektu dostupne su bez
        njega.
      </noscript>
    </section>
  );
}

function Options({
  question,
  feedback,
  selected,
  onSelect,
}: {
  question: PracticeQuestionView;
  feedback?: PracticeFeedback;
  selected?: string;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="practice-options">
      {question.options.map((option, index) => {
        const correct = feedback?.correctOption === option.key;
        const chosen = feedback?.selectedOption === option.key;
        const content = (
          <>
            <span className="option-letter" aria-hidden="true">
              {String.fromCharCode(65 + index)}
            </span>
            <span>{option.text}</span>
            {feedback && (
              <span className="option-state">
                {correct ? "✓ Tačan odgovor" : chosen ? "✕ Tvoj odgovor" : ""}
              </span>
            )}
          </>
        );
        return feedback ? (
          <div
            className={`practice-option ${correct ? "option-correct" : chosen ? "option-incorrect" : ""}`}
            key={option.key}
          >
            {content}
          </div>
        ) : (
          <label
            className={`practice-option ${selected === option.key ? "option-selected" : ""}`}
            key={option.key}
          >
            <input
              type="radio"
              name="answer"
              value={option.key}
              checked={selected === option.key}
              onChange={() => onSelect?.(option.key)}
              required
            />
            {content}
          </label>
        );
      })}
    </div>
  );
}
function Feedback({ answer }: { answer: PracticeFeedback }) {
  return (
    <div className="practice-explanation">
      <p>
        <strong>Tvoj odgovor: </strong>
        {answer.question.options.find((option) => option.key === answer.selectedOption)?.text}
      </p>
      {!answer.correct && (
        <p>
          <strong>Tačan odgovor: </strong>
          {answer.question.options.find((option) => option.key === answer.correctOption)?.text}
        </p>
      )}
      <p>{answer.explanation}</p>
      {answer.sources.length > 0 && (
        <ul aria-label="Izvori">
          {answer.sources.map((source, index) => (
            <li key={`${source.url}-${index}`}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title} ↗
              </a>
              <span> · {source.reference}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
