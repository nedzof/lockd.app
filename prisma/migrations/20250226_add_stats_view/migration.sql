-- CreateTable
CREATE TABLE "stats" (
  "id" TEXT NOT NULL,
  "total_posts" INTEGER NOT NULL,
  "total_votes" INTEGER NOT NULL,
  "total_lock_likes" INTEGER NOT NULL,
  "total_users" INTEGER NOT NULL,
  "total_bsv_locked" INTEGER NOT NULL,
  "avg_lock_duration" DOUBLE PRECISION NOT NULL,
  "most_used_tag" TEXT,
  "most_active_user" TEXT,
  "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stats_pkey" PRIMARY KEY ("id")
);
