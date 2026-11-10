-- Prisma does not model these editorial integrity constraints/triggers.
ALTER TABLE "QuestionRevision"
  ADD CONSTRAINT "positive_revision" CHECK ("revision" > 0),
  ADD CONSTRAINT "review_evidence" CHECK (
    "status" = 'DRAFT' OR (
      "reviewer" IS NOT NULL AND length(trim("reviewer")) >= 3 AND "reviewedOn" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "publication_timestamp" CHECK (
    ("status" = 'PUBLISHED') = ("publishedAt" IS NOT NULL)
  );

CREATE FUNCTION protect_question_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE option_count integer;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Published revisions are immutable; create a new revision';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW."status" = 'PUBLISHED' THEN
    SELECT count(*) INTO option_count FROM "AnswerOption" WHERE "questionId" = NEW."id";
    IF option_count < 2 OR option_count > 6 OR NOT EXISTS (
      SELECT 1 FROM "AnswerOption" WHERE "questionId" = NEW."id" AND "key" = NEW."correctOption"
    ) THEN
      RAISE EXCEPTION 'Publish only after inserting valid options and a correct answer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER question_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON "QuestionRevision"
  FOR EACH ROW EXECUTE FUNCTION protect_question_revision();

CREATE FUNCTION protect_published_options() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status "ReviewStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT "status" INTO parent_status FROM "QuestionRevision" WHERE "id" = OLD."questionId" FOR UPDATE;
    IF parent_status = 'PUBLISHED' THEN RAISE EXCEPTION 'Published answer options are immutable'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT "status" INTO parent_status FROM "QuestionRevision" WHERE "id" = NEW."questionId" FOR UPDATE;
    IF parent_status = 'PUBLISHED' THEN RAISE EXCEPTION 'Published answer options are immutable'; END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER answer_option_guard BEFORE INSERT OR UPDATE OR DELETE ON "AnswerOption"
  FOR EACH ROW EXECUTE FUNCTION protect_published_options();
