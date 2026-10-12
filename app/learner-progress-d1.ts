import {
  persistLearnerProgress,
  type LearnerProgressPersistence,
  type StoredLearnerProgress,
} from "./local-progress";
import { getRequestExecutionContext } from "vinext/shims/request-context";

type D1LearnerProgressDatabase = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

type D1LearnerProgressRequestContext = {
  DB: D1LearnerProgressDatabase;
  learnerProgressLoads: Map<
    string,
    Promise<Partial<StoredLearnerProgress> | null>
  >;
};

function getD1LearnerProgressRequestContext(): D1LearnerProgressRequestContext {
  const requestContext = getRequestExecutionContext() as
    | D1LearnerProgressRequestContext
    | null;

  if (!requestContext?.DB || !requestContext.learnerProgressLoads) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  return requestContext;
}

export function loadD1LearnerProgress(learnerId: string) {
  const requestContext = getD1LearnerProgressRequestContext();
  const pendingLoad = requestContext.learnerProgressLoads.get(learnerId);

  if (pendingLoad) return pendingLoad;

  const load = createD1LearnerProgressPersistence(requestContext.DB)
    .load(learnerId);
  requestContext.learnerProgressLoads.set(learnerId, load);

  return load;
}

export function saveD1LearnerProgress(snapshot: StoredLearnerProgress) {
  const requestContext = getD1LearnerProgressRequestContext();

  return persistLearnerProgress(
    createD1LearnerProgressPersistence(requestContext.DB),
    snapshot,
  );
}

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
            snapshot = json_set(
              excluded.snapshot,
              '$.completedActivityIds', json((
                SELECT json_group_array(activity_id)
                FROM (
                  SELECT value AS activity_id
                  FROM json_each(COALESCE(json_extract(learner_progress.snapshot, '$.completedActivityIds'), '[]'))
                  UNION
                  SELECT value AS activity_id
                  FROM json_each(COALESCE(json_extract(excluded.snapshot, '$.completedActivityIds'), '[]'))
                )
              )),
              '$.completedListeningActivityIds', json((
                SELECT json_group_array(activity_id)
                FROM (
                  SELECT value AS activity_id
                  FROM json_each(COALESCE(json_extract(learner_progress.snapshot, '$.completedListeningActivityIds'), '[]'))
                  UNION
                  SELECT value AS activity_id
                  FROM json_each(COALESCE(json_extract(excluded.snapshot, '$.completedListeningActivityIds'), '[]'))
                )
              )),
              '$.progressRecords', json((
                SELECT json_group_array(json(record.value))
                FROM (
                  SELECT stored.value
                  FROM json_each(COALESCE(json_extract(learner_progress.snapshot, '$.progressRecords'), '[]')) AS stored
                  UNION ALL
                  SELECT incoming.value
                  FROM json_each(COALESCE(json_extract(excluded.snapshot, '$.progressRecords'), '[]')) AS incoming
                  WHERE NOT EXISTS (
                    SELECT 1
                    FROM json_each(COALESCE(json_extract(learner_progress.snapshot, '$.progressRecords'), '[]')) AS stored
                    WHERE json_extract(stored.value, '$.recordId') = json_extract(incoming.value, '$.recordId')
                  )
                ) AS record
              ))
            ),
            updated_at = CURRENT_TIMESTAMP
        `)
        .bind(learnerId, JSON.stringify(snapshot))
        .run();
    },
  };
}
