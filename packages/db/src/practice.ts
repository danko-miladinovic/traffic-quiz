import { createHash, randomInt } from "node:crypto";
import { questionSchema } from "@duel/domain";
import {
  PracticeError,
  practiceAnswerSchema,
  practiceStartSchema,
  practiceOptionsSchema,
  practiceSourcesSchema,
  practiceImageSchema,
  scorePractice,
  type PracticeCategory,
  type PracticeEvent,
  type PracticeEventHook,
  type PracticeFeedback,
  type PracticeQuestionView,
  type PracticeView,
} from "@duel/domain/practice";
import { Prisma } from "../generated/client";
import type { Database } from "./client";
import { demoCategory, demoQuestions } from "./demo";
import { transaction } from "./transaction";

export const GUEST_DAYS = 30;
export const ATTEMPT_HOURS = 24;
const day = 86_400_000;
const localeId = "sr-Latn-RS";
const licenceCategory = "B";
const notFound = () => new PracticeError("NOT_FOUND", "Vežbanje nije pronađeno.", 404);
type Snapshot = {
  questionRevisionId: string | null;
  prompt: string;
  options: { key: string; text: string }[];
  correctOption: string;
  explanation: string;
  sources: Prisma.InputJsonValue;
  image: Prisma.InputJsonValue | null;
};

export async function openGuestSession(db: Database, tokenHash: string, now = new Date()) {
  return transaction(db, async (tx) => {
    const existing = await tx.guestSession.findUnique({ where: { tokenHash } });
    if (existing && existing.expiresAt <= now)
      throw new PracticeError("SESSION_EXPIRED", "Sesija je istekla. Pokreni novo vežbanje.", 401);
    return tx.guestSession.upsert({
      where: { tokenHash },
      create: {
        tokenHash,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(+now + GUEST_DAYS * day),
      },
      update: { lastSeenAt: now, expiresAt: new Date(+now + GUEST_DAYS * day) },
    });
  });
}

async function requireGuest(tx: Prisma.TransactionClient, hash: string, now: Date) {
  const guest = await tx.guestSession.findUnique({ where: { tokenHash: hash } });
  if (!guest || guest.expiresAt <= now)
    throw new PracticeError("SESSION_EXPIRED", "Sesija je istekla. Pokreni novo vežbanje.", 401);
  // This update locks the guest row until commit, serializing concurrent browser tabs.
  await tx.guestSession.update({
    where: { id: guest.id },
    data: { lastSeenAt: now, expiresAt: new Date(+now + GUEST_DAYS * day) },
  });
  return guest;
}

export async function listPracticeCategories(
  db: Database,
  allowDemo = false,
): Promise<PracticeCategory[]> {
  const [categories, published] = await Promise.all([
    db.category.findMany({ where: { localeId, licenceCategory }, orderBy: { title: "asc" } }),
    db.questionRevision.groupBy({
      by: ["categoryId", "key"],
      where: { status: "PUBLISHED", category: { localeId, licenceCategory } },
    }),
  ]);
  const counts = new Map<string, number>();
  for (const row of published) counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
  return [
    ...categories.map((category) => ({
      key: category.key,
      title: category.title,
      description: category.description,
      count: counts.get(category.id) ?? 0,
      demo: false,
    })),
    ...(allowDemo ? [demoCategory] : []),
  ];
}

function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

const includeAttempt = {
  questions: { orderBy: { position: "asc" as const }, include: { answer: true } },
};
type Attempt = Prisma.PracticeAttemptGetPayload<{ include: typeof includeAttempt }>;
type Question = Attempt["questions"][number];

function questionView(question: Question): PracticeQuestionView {
  return {
    id: question.id,
    position: question.position,
    prompt: question.prompt,
    options: practiceOptionsSchema.parse(question.options),
    image: question.image ? practiceImageSchema.parse(question.image) : null,
  };
}
function feedback(question: Question): PracticeFeedback {
  if (!question.answer) throw new Error("Feedback requires an accepted answer");
  return {
    question: questionView(question),
    selectedOption: question.answer.optionKey,
    correctOption: question.correctOption,
    correct: question.answer.correct,
    explanation: question.explanation,
    sources: practiceSourcesSchema.parse(question.sources),
  };
}
function view(attempt: Attempt, now: Date): PracticeView {
  if (!attempt.completedAt && attempt.expiresAt <= now)
    throw new PracticeError(
      "ATTEMPT_EXPIRED",
      "Vežbanje je isteklo posle 24 sata. Započni novo.",
      410,
    );
  const answered = attempt.questions.filter((question) => question.answer);
  return {
    id: attempt.id,
    categoryKey: attempt.categoryKey,
    categoryTitle: attempt.categoryTitle,
    demo: attempt.demo,
    total: attempt.total,
    answered: attempt.nextPosition,
    completed: !!attempt.completedAt,
    current: attempt.completedAt ? null : questionView(attempt.questions[attempt.nextPosition]),
    feedback: answered.length ? feedback(answered[answered.length - 1]) : null,
    result: attempt.completedAt
      ? {
          ...scorePractice(
            answered.map((question) => question.answer!),
            attempt.total,
          ),
          answers: answered.map(feedback),
        }
      : null,
  };
}

function event(name: PracticeEvent["name"], id: string, attempt: Attempt): PracticeEvent {
  return {
    name,
    eventId: createHash("sha256").update(`${name}:${id}`).digest("hex"),
    total: attempt.total,
    demo: attempt.demo,
  };
}
function emit(hook: PracticeEventHook | undefined, events: PracticeEvent[]) {
  for (const item of events) {
    try {
      hook?.(item);
    } catch {
      /* Observers must never break an accepted submission. */
    }
  }
}

export async function startPractice(
  db: Database,
  hash: string,
  input: unknown,
  options: { allowDemo?: boolean; now?: Date; onEvent?: PracticeEventHook } = {},
) {
  const parsed = practiceStartSchema.safeParse(input);
  if (!parsed.success)
    throw new PracticeError("INVALID_INPUT", "Proveri izabranu oblast i pokušaj ponovo.", 400);
  const { categoryKey, requestId } = parsed.data;
  const now = options.now ?? new Date();
  const result = await transaction(db, async (tx) => {
    const guest = await requireGuest(tx, hash, now);
    const existing = await tx.practiceAttempt.findUnique({
      where: { guestId_requestId: { guestId: guest.id, requestId } },
      include: includeAttempt,
    });
    if (existing) {
      if (existing.demo && !options.allowDemo) throw notFound();
      if (existing.categoryKey !== categoryKey)
        throw new PracticeError(
          "REQUEST_CONFLICT",
          "Ovaj zahtev je već upotrebljen za drugu oblast.",
          409,
        );
      return { view: view(existing, now), events: [] };
    }
    const recent = await tx.practiceAttempt.count({
      where: { guestId: guest.id, createdAt: { gte: new Date(+now - 60_000) } },
    });
    if (recent >= 10)
      throw new PracticeError("RATE_LIMIT", "Sačekaj minut pre novog vežbanja.", 429);
    const demo = !!options.allowDemo && categoryKey === demoCategory.key;
    const category = demo
      ? null
      : await tx.category.findUnique({
          where: { localeId_licenceCategory_key: { localeId, licenceCategory, key: categoryKey } },
        });
    if (!category && !demo) throw notFound();
    const rows = category
      ? await tx.questionRevision.findMany({
          where: { categoryId: category.id, status: "PUBLISHED" },
          orderBy: [{ key: "asc" }, { revision: "desc" }],
        })
      : [];
    const seen = new Set<string>();
    const questions: Snapshot[] = demo
      ? demoQuestions
      : rows
          .filter((row) => {
            if (seen.has(row.key)) return false;
            seen.add(row.key);
            return true;
          })
          .map((row) => {
            const question = questionSchema.parse(row.content);
            return {
              questionRevisionId: row.id,
              prompt: question.prompt,
              options: question.options,
              correctOption: question.correctOption,
              explanation: question.explanation,
              sources: question.sources,
              image: question.image ?? null,
            };
          });
    if (!questions.length)
      throw new PracticeError("NO_CONTENT", "U ovoj oblasti još nema objavljenih pitanja.", 409);
    const selected = shuffle(questions).slice(0, 5);
    const attempt = await tx.practiceAttempt.create({
      data: {
        guestId: guest.id,
        requestId,
        categoryId: category?.id,
        categoryKey,
        categoryTitle: category?.title ?? demoCategory.title,
        demo,
        total: selected.length,
        createdAt: now,
        expiresAt: new Date(+now + ATTEMPT_HOURS * 3_600_000),
        questions: {
          create: selected.map((question, position) => ({
            ...question,
            image: question.image ?? Prisma.DbNull,
            options: shuffle(question.options),
            position,
          })),
        },
      },
      include: includeAttempt,
    });
    return { view: view(attempt, now), events: [event("practice_started", attempt.id, attempt)] };
  });
  emit(options.onEvent, result.events);
  return result.view;
}

async function ownedAttempt(
  tx: Prisma.TransactionClient,
  hash: string,
  id: string,
  now: Date,
  allowDemo = false,
) {
  const guest = await requireGuest(tx, hash, now);
  const attempt = await tx.practiceAttempt.findFirst({
    where: { id, guestId: guest.id },
    include: includeAttempt,
  });
  if (!attempt || (attempt.demo && !allowDemo)) throw notFound();
  return attempt;
}
export async function getPractice(
  db: Database,
  hash: string,
  id: string,
  options: { allowDemo?: boolean; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  return transaction(db, async (tx) =>
    view(await ownedAttempt(tx, hash, id, now, options.allowDemo), now),
  );
}

export async function answerPractice(
  db: Database,
  hash: string,
  id: string,
  input: unknown,
  options: { allowDemo?: boolean; now?: Date; onEvent?: PracticeEventHook } = {},
) {
  const parsed = practiceAnswerSchema.safeParse(input);
  if (!parsed.success)
    throw new PracticeError("INVALID_INPUT", "Izaberi jedan od ponuđenih odgovora.", 400);
  const now = options.now ?? new Date();
  const { questionId, optionKey } = parsed.data;
  const result = await transaction(db, async (tx) => {
    const attempt = await ownedAttempt(tx, hash, id, now, options.allowDemo);
    view(attempt, now); // Enforces expiry before accepting even a duplicate answer.
    const question = attempt.questions.find((item) => item.id === questionId);
    if (!question) throw notFound();
    if (question.answer) {
      if (question.answer.optionKey !== optionKey)
        throw new PracticeError(
          "ALREADY_ANSWERED",
          "Odgovor je već potvrđen. Osveži prikaz da nastaviš.",
          409,
        );
      return { view: view(attempt, now), events: [] };
    }
    if (attempt.completedAt || question.position !== attempt.nextPosition)
      throw new PracticeError("OUT_OF_ORDER", "Prvo odgovori na trenutno pitanje.", 409);
    const valid = practiceOptionsSchema
      .parse(question.options)
      .some((option) => option.key === optionKey);
    if (!valid)
      throw new PracticeError("INVALID_OPTION", "Izabrani odgovor ne pripada ovom pitanju.", 400);
    await tx.practiceAnswer.create({
      data: {
        questionId,
        optionKey,
        correct: optionKey === question.correctOption,
        submittedAt: now,
      },
    });
    const completed = attempt.nextPosition + 1 === attempt.total;
    const updated = await tx.practiceAttempt.update({
      where: { id },
      data: { nextPosition: { increment: 1 }, completedAt: completed ? now : null },
      include: includeAttempt,
    });
    const events = [event("question_answered", questionId, updated)];
    if (completed) events.push(event("practice_completed", id, updated));
    return { view: view(updated, now), events };
  });
  emit(options.onEvent, result.events);
  return result.view;
}

export async function cleanupPractice(db: Database, now = new Date()) {
  return db.$transaction(async (tx) => {
    const duels = await tx.duel.deleteMany({
      where: {
        OR: [
          { createdAt: { lt: new Date(+now - 30 * day) } },
          { players: { some: { guest: { expiresAt: { lte: now } } } } },
        ],
      },
    });
    const attempts = await tx.practiceAttempt.deleteMany({
      where: { createdAt: { lt: new Date(+now - 30 * day) } },
    });
    const sessions = await tx.guestSession.deleteMany({ where: { expiresAt: { lte: now } } });
    return { attempts: attempts.count, sessions: sessions.count, duels: duels.count };
  });
}
