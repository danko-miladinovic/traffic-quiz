"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import QRCode from "qrcode";
import type { DuelAction, DuelReply, DuelRoundFeedback, DuelView } from "@duel/domain/duel";
import type { PracticeCategory } from "@duel/domain/practice";
import { Button } from "./button";

const roomKey = "duel.multiplayer.room";
const intentKey = "duel.multiplayer.intent";
type Intent = { categoryKey: string; requestId: string };
type PendingAnswer = { roomId: string; round: number; optionKey: string };
const read = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, value: string | null) => {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* Session cookie still authorizes the active connection. */
  }
};
function savedIntent(): Intent | null {
  try {
    const value = JSON.parse(read(intentKey) ?? "null") as Intent | null;
    if (value && typeof value.categoryKey === "string" && typeof value.requestId === "string")
      return value;
  } catch {
    /* Invalid tab-local storage is discarded. */
  }
  store(intentKey, null);
  return null;
}
let sessionRequest: Promise<void> | null = null;
async function ensureSession() {
  if (!sessionRequest)
    sessionRequest = (async () => {
      const response = await fetch("/api/duel/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        credentials: "same-origin",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Sesija trenutno nije dostupna. Pokušaj ponovo.");
    })().finally(() => {
      sessionRequest = null;
    });
  return sessionRequest;
}
class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function Duel() {
  const [categories, setCategories] = useState<PracticeCategory[]>([]);
  const [game, setGame] = useState<DuelView | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState<PendingAnswer | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const socket = useRef<Socket | null>(null);
  const current = useRef<DuelView | null>(null);
  const desired = useRef<string | null>(null);
  const invitation = useRef<string | null>(null);
  const intent = useRef<Intent | null>(null);
  const actionLock = useRef(false);
  const abandoning = useRef(false);
  const offset = useRef(0);
  const focusKey = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);

  function accept(state: DuelView) {
    if (!mounted.current || desired.current !== state.id) return;
    if (current.current?.id === state.id && state.version < current.current.version) return;
    const previous = current.current;
    offset.current = state.serverNow - Date.now();
    const nextQuestion = state.question?.id;
    if (state.id !== previous?.id || nextQuestion !== previous?.question?.id) {
      setSelected("");
      setPending(null);
    }
    if (
      state.phase !== "ROUND" ||
      state.players.find((player) => player.seat === state.self)?.answered
    )
      setPending(null);
    current.current = state;
    setGame(state);
    setError(null);
    store(roomKey, state.id);
    if (!abandoning.current && state.nextDuelId && desired.current === state.id) {
      desired.current = state.nextDuelId;
      store(roomKey, state.nextDuelId);
      setBusy(true);
      void request("duel:watch", { roomId: state.nextDuelId })
        .catch((failure) => {
          if (mounted.current)
            setError(failure instanceof Error ? failure.message : "Revanš nije dostupan.");
        })
        .finally(() => {
          if (mounted.current) setBusy(false);
        });
    }
  }
  async function request(event: DuelAction, payload: unknown): Promise<DuelView> {
    if (event === "duel:join" && !/^[a-f0-9]{64}$/.test((payload as { token: string }).token)) {
      throw new RequestError("INVITE_INVALID", "Pozivni link nije ispravan. Zatraži novi poziv.");
    }
    const client = socket.current;
    if (!client?.connected)
      throw new RequestError("DISCONNECTED", "Veza je prekinuta. Sačekaj ponovno povezivanje.");
    return new Promise((resolve, reject) => {
      client
        .timeout(8000)
        .emit(event, payload, (timeout: Error | null, reply: DuelReply | undefined) => {
          if (timeout || !reply) {
            reject(
              new RequestError(
                "ACK_TIMEOUT",
                "Potvrda nije stigla. Proveri stanje ili ponovi isti zahtev.",
              ),
            );
            return;
          }
          if (!reply.ok) {
            reject(new RequestError(reply.error.code, reply.error.message));
            return;
          }
          if (event === "duel:create") {
            const submitted = payload as Intent;
            if (intent.current?.requestId !== submitted.requestId) {
              resolve(reply.state);
              return;
            }
            intent.current = null;
            store(intentKey, null);
            desired.current = reply.state.id;
          } else if (event === "duel:join") {
            invitation.current = null;
            history.replaceState(null, "", window.location.pathname + window.location.search);
            desired.current = reply.state.id;
          }
          accept(reply.state);
          resolve(reply.state);
        });
    });
  }
  async function perform(event: DuelAction, payload: unknown) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    const connection = socket.current?.id;
    try {
      await request(event, payload);
    } catch (failure) {
      if (!mounted.current || (socket.current?.connected && socket.current.id !== connection))
        return;
      setError(failure instanceof Error ? failure.message : "Zahtev nije uspeo. Pokušaj ponovo.");
      if (
        failure instanceof RequestError &&
        ["ROUND_CLOSED", "ALREADY_ANSWERED", "NOT_STARTED"].includes(failure.code) &&
        desired.current
      ) {
        setPending(null);
        void request("duel:watch", { roomId: desired.current }).catch(() => {});
      }
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    setOrigin(window.location.origin);
    invitation.current = new URLSearchParams(window.location.hash.slice(1)).get("poziv");
    intent.current = savedIntent();
    desired.current = read(roomKey);
    async function initialize() {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/duel/categories", {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("Duel trenutno nije dostupan. Pokušaj ponovo uskoro.");
        const result = (await response.json()) as { categories: PracticeCategory[] };
        await ensureSession();
        if (cancelled) return;
        setCategories(result.categories);
        const client = io({
          path: "/socket.io",
          transports: ["polling", "websocket"],
          tryAllTransports: true,
          withCredentials: true,
          autoConnect: false,
          reconnectionDelay: 500,
          reconnectionDelayMax: 2000,
          timeout: 5000,
        });
        socket.current = client;
        client.on("duel:state", (state: DuelView) => accept(state));
        client.on("duel:unavailable", (notice: string) => {
          setConnected(false);
          setError(notice);
        });
        client.on("connect", () => {
          if (cancelled) return;
          setConnected(true);
          setError(null);
          setBusy(true);
          const connection = client.id;
          const event: DuelAction | null = invitation.current
            ? "duel:join"
            : intent.current
              ? "duel:create"
              : desired.current
                ? "duel:watch"
                : null;
          const payload = invitation.current
            ? { token: invitation.current }
            : (intent.current ?? { roomId: desired.current });
          if (event)
            void request(event, payload)
              .catch((failure) => {
                if (!cancelled && client.id === connection)
                  setError(failure instanceof Error ? failure.message : "Duel nije dostupan.");
              })
              .finally(() => {
                if (!cancelled && client.id === connection) setBusy(false);
              });
          else setBusy(false);
        });
        client.on("disconnect", () => {
          if (!cancelled) {
            setConnected(false);
            setBusy(false);
          }
        });
        client.on("connect_error", () => {
          if (!cancelled) {
            setConnected(false);
            setBusy(false);
            setError("Ne možemo da se povežemo sa duelom. Pokušaj ponovo.");
          }
        });
        client.connect();
      } catch (failure) {
        if (!cancelled) {
          setBusy(false);
          setError(failure instanceof Error ? failure.message : "Duel nije dostupan.");
        }
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      mounted.current = false;
      socket.current?.disconnect();
      socket.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const key = `${game?.id}:${game?.phase}:${game?.roundIndex}`;
    if (game && focusKey.current !== key) {
      focusKey.current = key;
      heading.current?.focus();
    }
  }, [game?.id, game?.phase, game?.roundIndex]);

  const inviteUrl = game?.inviteToken && origin ? `${origin}/duel#poziv=${game.inviteToken}` : "";
  useEffect(() => {
    let cancelled = false;
    setQr("");
    setCopyNotice("");
    if (inviteUrl)
      void QRCode.toDataURL(inviteUrl, { width: 240, margin: 2, errorCorrectionLevel: "M" })
        .then((value) => {
          if (!cancelled) setQr(value);
        })
        .catch(() => {
          if (!cancelled) setCopyNotice("QR kod nije dostupan. Podeli pozivni link.");
        });
    return () => {
      cancelled = true;
    };
  }, [inviteUrl]);

  function reset() {
    store(roomKey, null);
    store(intentKey, null);
    invitation.current = null;
    intent.current = null;
    desired.current = null;
    current.current = null;
    setGame(null);
    setError(null);
    setPending(null);
    setSelected("");
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  function start(categoryKey: string) {
    const next = { categoryKey, requestId: crypto.randomUUID() };
    reset();
    intent.current = next;
    store(intentKey, JSON.stringify(next));
    void perform("duel:create", next);
  }
  async function abandon(categoryKey?: string) {
    if (actionLock.current || !current.current) return;
    actionLock.current = true;
    abandoning.current = true;
    setBusy(true);
    setError(null);
    try {
      await request("duel:leave", { roomId: current.current.id });
      reset();
      if (categoryKey) {
        const next = { categoryKey, requestId: crypto.randomUUID() };
        intent.current = next;
        store(intentKey, JSON.stringify(next));
        await request("duel:create", next);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Zahtev nije uspeo.");
    } finally {
      actionLock.current = false;
      abandoning.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function retry() {
    if (!socket.current?.connected) {
      setAttempt((value) => value + 1);
      return;
    }
    if (invitation.current) void perform("duel:join", { token: invitation.current });
    else if (intent.current) void perform("duel:create", intent.current);
    else if (desired.current) void perform("duel:watch", { roomId: desired.current });
    else {
      setError(null);
      setBusy(false);
    }
  }
  async function copyLink() {
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(inviteUrl);
      setCopyNotice("Link je kopiran.");
    } catch {
      linkInput.current?.select();
      setCopyNotice("Link je označen. Kopiraj ga i pošalji prijatelju.");
    }
  }
  async function shareLink() {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: "Saobraćajni Duel",
        text: "Izazivam te na duel znanja!",
        url: inviteUrl,
      });
    } catch (failure) {
      if (!(failure instanceof Error) || failure.name !== "AbortError")
        setCopyNotice("Deljenje nije uspelo. Kopiraj link.");
    }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!game || !selected) return;
    const answer = pending ?? { roomId: game.id, round: game.roundIndex, optionKey: selected };
    setPending(answer);
    void perform("duel:answer", answer);
  }
  const serverNow = clock + offset.current;
  const self = game?.players.find((player) => player.seat === game.self);
  const opponent = game?.players.find((player) => player.seat !== game.self);
  const remaining = Math.max(
    0,
    Math.ceil(((game?.question?.deadlineAt ?? serverNow) - serverNow) / 1000),
  );
  const beforeStart = !!game?.question && serverNow < game.question.opensAt;
  const done = !!game && ["FINISHED", "EXPIRED", "ABORTED"].includes(game.phase);

  return (
    <section className="container practice-page duel-page" aria-busy={busy}>
      <div className="practice-heading">
        <div>
          <p className="eyebrow">DVA IGRAČA · PET PITANJA</p>
          <h1>
            Znanje je bolje
            <br />
            <span>u društvu.</span>
          </h1>
        </div>
        <p>
          Ista pitanja. Isti uslovi.
          <br />
          Tačnost na prvom mestu, zatim vreme.
        </p>
      </div>
      <p className="duel-connection" role="status">
        <span className={`status-dot ${connected ? "" : "status-offline"}`} />
        {connected
          ? "Povezano sa duelom"
          : busy
            ? "Povezivanje…"
            : "Veza nije aktivna. Pokušavamo ponovo…"}
      </p>
      {error && (
        <div className="practice-error" role="alert" aria-label="Greška u duelu">
          <p>{error}</p>
          <div className="practice-actions">
            <Button disabled={busy} onClick={retry}>
              Pokušaj ponovo
            </Button>
            {!game && (
              <button className="text-link" disabled={busy} onClick={reset}>
                Izaberi novi izazov
              </button>
            )}
          </div>
        </div>
      )}
      {busy && (
        <p role="status" className="practice-loading">
          Sačekaj potvrdu servera…
        </p>
      )}
      {!game && !invitation.current && !intent.current && (
        <>
          <div className="practice-section-heading">
            <h2>Izaberi oblast za duel</h2>
            <p>Potrebno je pet objavljenih pitanja. Bez naloga i plaćanja.</p>
          </div>
          {!categories.some((category) => !category.demo && category.count >= 5) && (
            <div className="notice">
              <h3>Pitanja su na proveri</h3>
              <p>
                Obrazovni dueli biće dostupni kada oblast bude imala pet stručno proverenih i
                objavljenih pitanja.
              </p>
            </div>
          )}
          <div className="practice-category-grid">
            {categories.map((category) => (
              <article
                className={`practice-category ${category.demo ? "practice-category-demo" : ""}`}
                key={category.key}
              >
                <p className="eyebrow">
                  {category.demo
                    ? "TEHNIČKA PROBA · NIJE ISPITNA PRIPREMA"
                    : "SRBIJA · B KATEGORIJA"}
                </p>
                <h3>{category.title}</h3>
                <p>{category.description}</p>
                <div className="practice-category-bottom">
                  <span>Broj pitanja: {category.count}</span>
                  <Button
                    disabled={busy || !connected || category.count < 5}
                    onClick={() => start(category.key)}
                  >
                    Kreiraj duel →
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {game && (
        <div className="duel-workspace">
          {game.demo && (
            <aside className="demo-notice">
              Tehnička proba sa sintetičkim pitanjima. Ovaj rezultat ne meri poznavanje saobraćajnih
              pravila.
            </aside>
          )}
          <div className="duel-scoreboard">
            {game.players.map((player) => (
              <div key={player.seat} className={player.seat === game.self ? "duel-self" : ""}>
                <span>
                  {player.seat === game.self ? "Ti" : "Protivnik"} ·{" "}
                  {player.connected ? "povezan" : "bez veze"}
                </span>
                <strong>
                  {player.correct}
                  <small> / 5</small>
                </strong>
                <span>{(player.elapsedMs / 1000).toFixed(2)} s za tačne odgovore</span>
              </div>
            ))}
            {game.players.length === 1 && (
              <div>
                <span>Čekamo drugog igrača</span>
                <strong>?</strong>
                <span>Pošalji pozivni link ili QR kod</span>
              </div>
            )}
          </div>
          {!done && opponent && !opponent.connected && (
            <div className="duel-reconnect" role="status">
              Protivnik je izgubio vezu. Rok za povratak:{" "}
              {Math.max(0, Math.ceil(((opponent.reconnectUntil ?? serverNow) - serverNow) / 1000))}{" "}
              s. Rok trenutnog pitanja i dalje teče.
            </div>
          )}
          {(game.phase === "WAITING" || game.phase === "READY") && (
            <div className="duel-lobby practice-question">
              <p className="eyebrow">{game.categoryTitle}</p>
              <h2 ref={heading} tabIndex={-1}>
                {game.players.length === 1
                  ? "Pozovi prijatelja na duel."
                  : "Oboje ste tu. Spremni?"}
              </h2>
              {inviteUrl && (
                <div className="duel-invitation">
                  <div className="duel-qr">
                    {qr ? (
                      <img src={qr} alt="QR kod za poziv u duel" width="240" height="240" />
                    ) : (
                      <p>Pripremamo QR kod…</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="duel-invite-link">Privatni pozivni link</label>
                    <input
                      id="duel-invite-link"
                      ref={linkInput}
                      readOnly
                      value={inviteUrl}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <div className="practice-actions">
                      <Button onClick={() => void copyLink()}>Kopiraj link</Button>
                      <button className="text-link" onClick={() => void shareLink()}>
                        Podeli poziv ↗
                      </button>
                    </div>
                    <p>
                      Poziv važi još{" "}
                      {Math.max(0, Math.ceil((game.inviteExpiresAt - serverNow) / 60_000))} min.
                      Otvori ga u drugom pregledaču ili na drugom uređaju.
                    </p>
                    <p role="status">{copyNotice}</p>
                  </div>
                </div>
              )}
              <p className="duel-rules">
                Pet istih pitanja · {game.rules.questionMs / 1000} s po pitanju · Tačnost, pa zbir
                vremena tačnih odgovora. Moguć je nerešen rezultat.
              </p>
              <div className="duel-ready-list">
                {game.players.map((player) => (
                  <p key={player.seat}>
                    {player.seat === game.self ? "Ti" : "Protivnik"}:{" "}
                    <strong>{player.ready ? "✓ Spreman" : "Još nije spreman"}</strong>
                  </p>
                ))}
              </div>
              <Button
                disabled={busy || !connected || game.players.length < 2 || !opponent?.connected}
                onClick={() => void perform("duel:ready", { roomId: game.id, ready: !self?.ready })}
              >
                {self?.ready ? "Nisam spreman" : "Spreman sam"}
              </Button>
            </div>
          )}
          {game.phase === "ROUND" && game.question && (
            <div className="practice-question">
              <div className="duel-round-heading">
                <p className="eyebrow">PITANJE {game.roundIndex + 1} OD 5</p>
                <span
                  className={remaining <= 5 ? "duel-timer duel-timer-urgent" : "duel-timer"}
                  role="timer"
                  aria-live="off"
                  aria-label={`Preostalo vreme: ${remaining} sekundi`}
                >
                  {beforeStart ? "Pripremi se" : `${remaining} s`}
                </span>
              </div>
              <h2 ref={heading} tabIndex={-1}>
                {game.question.prompt}
              </h2>
              {game.question.image && (
                <div className="practice-image">
                  <img
                    src={game.question.image.path}
                    alt={game.question.image.alt}
                    width="320"
                    height="240"
                  />
                </div>
              )}
              <form onSubmit={submit}>
                <fieldset
                  disabled={
                    busy ||
                    !!pending ||
                    !!self?.answered ||
                    !connected ||
                    beforeStart ||
                    remaining <= 0
                  }
                >
                  <legend className="sr-only">Izaberi jedan odgovor</legend>
                  <div className="practice-options">
                    {game.question.options.map((option, index) => (
                      <label
                        className={`practice-option ${selected === option.key ? "option-selected" : ""}`}
                        key={option.key}
                      >
                        <input
                          type="radio"
                          name="duel-answer"
                          value={option.key}
                          checked={selected === option.key}
                          onChange={() => setSelected(option.key)}
                          required
                        />
                        <span className="option-letter" aria-hidden="true">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span>{option.text}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {self?.answered ? (
                  <p className="duel-answer-status" role="status">
                    ✓ Odgovor je sačuvan. Čekamo protivnika ili kraj vremena.
                  </p>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      busy || !connected || (!selected && !pending) || beforeStart || remaining <= 0
                    }
                  >
                    {pending ? "Ponovi isti odgovor" : "Potvrdi odgovor →"}
                  </Button>
                )}
              </form>
              <p className="practice-hint">
                {opponent?.answered
                  ? "Protivnik je potvrdio odgovor."
                  : "Protivnik još nije potvrdio odgovor."}{" "}
                Rezultat pitanja se otkriva istovremeno.
              </p>
            </div>
          )}
          {game.phase === "ROUND_RESULT" && game.feedback && (
            <div className="practice-question">
              <p className="eyebrow">PITANJE {game.roundIndex + 1} OD 5 · OBJAŠNJENJE</p>
              <h2 ref={heading} tabIndex={-1}>
                {game.feedback.question.prompt}
              </h2>
              <RoundReview round={game.feedback} self={game.self} />
              <p className="duel-answer-status" role="status">
                {opponent?.connected
                  ? "Nastavljamo zajedno za nekoliko trenutaka…"
                  : "Čekamo povratak protivnika…"}
              </p>
            </div>
          )}
          {game.phase === "FINISHED" && game.result && (
            <div className="practice-results">
              <p className="eyebrow">DUEL JE ZAVRŠEN</p>
              <h2 ref={heading} tabIndex={-1}>
                {game.result.winner === null
                  ? "Nerešeno — znanje delite!"
                  : game.result.winner === game.self
                    ? "Pobeda je tvoja!"
                    : "Dobar izazov. Sledeći je tvoj!"}
              </h2>
              <p>
                Prvo broj tačnih odgovora, zatim ukupno vreme tačnih odgovora. Vreme meri server i
                može da uključi kašnjenje veze.
              </p>
              <div className="practice-actions">
                <Button
                  disabled={busy || !connected}
                  onClick={() => void perform("duel:rematch", { roomId: game.id })}
                >
                  {self?.rematchReady ? "Čekamo revanš · proveri" : "Želim revanš"}
                </Button>
                <button
                  className="text-link"
                  disabled={busy || !connected}
                  onClick={() => void abandon(game.categoryKey)}
                >
                  Novi izazov ↗
                </button>
              </div>
              <p role="status">
                {self?.rematchReady
                  ? "Tvoj zahtev za revanš je sačuvan. Potrebna je saglasnost oba igrača."
                  : opponent?.rematchReady
                    ? "Protivnik želi revanš. Prihvati da igrate ponovo."
                    : "Revanš počinje tek kada ga oboje prihvatite."}
              </p>
              <h3>Šta ste naučili?</h3>
              <div className="practice-review-list">
                {game.result.rounds.map((round, index) => (
                  <details key={round.question.id}>
                    <summary>
                      {index + 1}. {round.question.prompt}
                    </summary>
                    <RoundReview round={round} self={game.self} />
                  </details>
                ))}
              </div>
            </div>
          )}
          {(game.phase === "ABORTED" || game.phase === "EXPIRED") && (
            <div className="notice">
              <h2 ref={heading} tabIndex={-1}>
                {game.phase === "EXPIRED" ? "Poziv je istekao." : "Duel je prekinut."}
              </h2>
              <p>
                {game.reason === "PLAYER_DISCONNECTED"
                  ? "Igrač se nije vratio na vreme."
                  : game.reason === "PLAYER_LEFT"
                    ? "Jedan igrač je završio duel."
                    : game.reason === "SERVER_RESTART" || game.reason === "SERVER_STOP"
                      ? "Servis je ponovo pokrenut ili zaustavljen."
                      : "Ovaj izazov više nije aktivan."}{" "}
                Pobednik nije proglašen.
              </p>
              <Button disabled={busy || !connected} onClick={() => start(game.categoryKey)}>
                Pokreni novi izazov →
              </Button>
            </div>
          )}
          {!done ? (
            <button
              className="text-link practice-leave"
              disabled={busy || !connected}
              onClick={() => void perform("duel:leave", { roomId: game.id })}
            >
              Završi duel bez rezultata
            </button>
          ) : (
            <button
              className="text-link practice-leave"
              disabled={busy || !connected}
              onClick={() => void abandon()}
            >
              Izaberi drugu oblast
            </button>
          )}
        </div>
      )}
      <p className="practice-privacy">
        Pozivni link služi za pridruživanje, a privatna sesija čuva tvoje mesto. Bez naloga i oglasa
        tokom pitanja. <Link href="/vezbanje">Vežbaj bez vremenskog ograničenja</Link>
      </p>
      <noscript>Za duel je potreban JavaScript i aktivna veza oba igrača.</noscript>
    </section>
  );
}

function RoundReview({ round, self }: { round: DuelRoundFeedback; self: number }) {
  return (
    <div className="practice-explanation">
      <p>
        <strong>Tačan odgovor: </strong>
        {round.question.options.find((option) => option.key === round.question.correctOption)?.text}
      </p>
      <div className="duel-round-answers">
        {round.answers.map((answer) => (
          <p key={answer.seat}>
            <strong>{answer.seat === self ? "Ti" : "Protivnik"}: </strong>
            {answer.optionKey
              ? round.question.options.find((option) => option.key === answer.optionKey)?.text
              : "Bez odgovora"}
            <span className={answer.correct ? "answer-good" : "answer-bad"}>
              {" "}
              · {answer.correct ? "✓ Tačno" : answer.optionKey ? "✕ Netačno" : "Isteklo vreme"}
            </span>
          </p>
        ))}
      </div>
      <p>{round.question.explanation}</p>
      {round.question.sources.length > 0 && (
        <ul aria-label="Izvori">
          {round.question.sources.map((source, index) => (
            <li key={`${source.url}-${index}`}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title} ↗
              </a>{" "}
              · {source.reference}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
