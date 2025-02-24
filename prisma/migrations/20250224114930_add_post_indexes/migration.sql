-- CreateIndex
CREATE INDEX "Post_created_at_id_idx" ON "Post"("created_at", "id");

-- CreateIndex
CREATE INDEX "Post_is_locked_created_at_idx" ON "Post"("is_locked", "created_at");
