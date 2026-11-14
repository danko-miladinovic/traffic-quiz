// Synthetic interface fixtures, deliberately unrelated to traffic law or the draft bank.
// Never imported into QuestionRevision, assigned a reviewer, or enabled in production.
export const demoCategory = {
  key: "tehnicka-proba",
  title: "Tehnička proba",
  description:
    "Pet jednostavnih pitanja za isprobavanje interfejsa. Nije priprema za vozački ispit.",
  count: 5,
  demo: true,
};
export const demoQuestions = [
  {
    prompt: "Koji oblik prikazuje simbol △?",
    options: ["Trougao", "Krug", "Kvadrat"],
    explanation:
      "Simbol △ predstavlja trougao. Ovo je sintetički primer za proveru prikaza odgovora.",
  },
  {
    prompt: "Koji broj dolazi odmah posle broja 2?",
    options: ["3", "1", "5"],
    explanation: "Posle broja 2 dolazi broj 3. Ovaj primer proverava tok pitanja i objašnjenja.",
  },
  {
    prompt: "Koji oblik prikazuje simbol ○?",
    options: ["Krug", "Trougao", "Kvadrat"],
    explanation: "Simbol ○ predstavlja krug. Ovo pitanje služi samo za tehničku probu vežbanja.",
  },
  {
    prompt: "Koliko slova ima reč DUEL?",
    options: ["Četiri", "Dva", "Pet"],
    explanation: "Reč DUEL ima četiri slova: D, U, E i L. Odgovor se proverava na serveru.",
  },
  {
    prompt: "Koji znak predstavlja sabiranje?",
    options: ["+", "−", "="],
    explanation:
      "Znak + označava sabiranje. Rezultat ove probe nije ocena poznavanja saobraćajnih pravila.",
  },
].map((question) => ({
  ...question,
  options: question.options.map((text, index) => ({ key: `opcija-${index + 1}`, text })),
  correctOption: "opcija-1",
  sources: [],
  image: null,
  questionRevisionId: null,
}));
