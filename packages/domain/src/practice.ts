import { z } from "zod";

export const practiceStartSchema = z.strictObject({
  categoryKey: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  requestId: z.uuid(),
});
export const practiceAnswerSchema = z.strictObject({
  questionId: z.string().min(1).max(100),
  optionKey: z.string().min(1).max(100),
});

export const practiceOptionsSchema = z
  .array(z.object({ key: z.string(), text: z.string() }))
  .min(2)
  .max(6);
export const practiceImageSchema = z.object({ path: z.string(), alt: z.string() });
export const practiceSourcesSchema = z.array(
  z.object({ title: z.string(), url: z.url(), reference: z.string() }),
);

export type PracticeCategory = {
  key: string;
  title: string;
  description: string;
  count: number;
  demo: boolean;
};
export type PracticeQuestionView = {
  id: string;
  position: number;
  prompt: string;
  options: z.infer<typeof practiceOptionsSchema>;
  image: z.infer<typeof practiceImageSchema> | null;
};
export type PracticeFeedback = {
  question: PracticeQuestionView;
  selectedOption: string;
  correctOption: string;
  correct: boolean;
  explanation: string;
  sources: z.infer<typeof practiceSourcesSchema>;
};
export type PracticeView = {
  id: string;
  categoryKey: string;
  categoryTitle: string;
  demo: boolean;
  total: number;
  answered: number;
  completed: boolean;
  current: PracticeQuestionView | null;
  feedback: PracticeFeedback | null;
  result: { correct: number; percent: number; answers: PracticeFeedback[] } | null;
};

// Typed hooks only: no identifiers, answers, provider or data collection in phase 2.
export type PracticeEvent = {
  name: "practice_started" | "question_answered" | "practice_completed";
  eventId: string;
  total: number;
  demo: boolean;
};
export type PracticeEventHook = (event: PracticeEvent) => void;

export class PracticeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function scorePractice(answers: ReadonlyArray<{ correct: boolean }>, total: number) {
  if (!Number.isInteger(total) || total < 1 || answers.length > total)
    throw new Error("Invalid attempt size");
  const correct = answers.filter((answer) => answer.correct).length;
  return { correct, percent: Math.round((correct / total) * 100) };
}
