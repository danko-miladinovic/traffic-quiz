-- Supports active-duel authorization and guest-expiry cleanup without a table scan.
CREATE INDEX "DuelPlayer_guestId_idx" ON "DuelPlayer"("guestId");
