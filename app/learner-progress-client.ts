import {
  createLocalLearnerProgressPersistence,
  loadLearnerProgress,
  persistLearnerProgress,
  type StoredLearnerProgress,
} from "./local-progress";

type BrowserProgressStorage = Pick<Storage, "getItem" | "setItem">;

export async function persistLearnerJourneyProgress(
  storage: BrowserProgressStorage,
  progress: StoredLearnerProgress,
) {
  let progressToSend = progress;
  try {
    const persistence = createLocalLearnerProgressPersistence(storage);
    await persistLearnerProgress(persistence, progress);
    const localProgress = await loadLearnerProgress(persistence, progress.learnerId);
    if (localProgress) {
      progressToSend = {
        ...progress,
        progressRecords: localProgress.progressRecords.map((record) => ({
          ...record,
          recordedAt: record.recordedAt.toISOString(),
        })),
      };
    }
  } catch {
    // Keep the learning flow available if browser storage is unavailable.
  }

  try {
    await fetch("/api/learner-progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(progressToSend),
    });
  } catch {
    // Keep the learning flow available if remote persistence is unavailable.
  }
}
