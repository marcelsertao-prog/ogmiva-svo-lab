import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const learnerProgress = sqliteTable("learner_progress", {
  learnerId: text("learner_id").primaryKey(),
  snapshot: text("snapshot").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
