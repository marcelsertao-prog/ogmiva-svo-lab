import type {
  LearnerProgressPersistence,
  StoredLearnerProgress,
} from "./local-progress";

type D1LearnerProgressDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

export function createD1LearnerProgressPersistence(
  database: D1LearnerProgressDatabase,
): LearnerProgressPersistence {
  return {
    async load(learnerId) {
      const storedProgress = await database
        .prepare(`
          SELECT snapshot
          FROM learner_progress
          WHERE learner_id = ?
        `)
        .bind(learnerId)
        .first<{ snapshot: string }>();

      return storedProgress
        ? JSON.parse(storedProgress.snapshot) as Partial<StoredLearnerProgress>
        : null;
    },
    async save(learnerId, snapshot) {
      await database
        .prepare(`
          INSERT INTO learner_progress (
            learner_id,
            snapshot,
            updated_at
          ) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT (learner_id) DO UPDATE SET
            snapshot = excluded.snapshot,
            updated_at = CURRENT_TIMESTAMP
        `)
        .bind(learnerId, JSON.stringify(snapshot))
        .run();
    },
  };
}
