import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const learnerProgress = sqliteTable("learner_progress", {
  learnerId: text("learner_id").primaryKey(),
  snapshot: text("snapshot").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const learnerSessions = sqliteTable("learner_sessions", {
  sessionId: text("session_id").primaryKey(),
  learnerId: text("learner_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const learnerAccounts = sqliteTable("learner_accounts", {
  loginId: text("login_id").primaryKey(),
  learnerId: text("learner_id").notNull(),
  credentialHash: text("credential_hash").notNull(),
});
