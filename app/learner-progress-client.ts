import {
  createLocalLearnerProgressPersistence,
  persistLearnerProgress,
  type StoredLearnerProgress,
} from "./local-progress";

type BrowserProgressStorage = Pick<Storage, "getItem" | "setItem">;

export async function persistLearnerJourneyProgress(
  storage: BrowserProgressStorage,
  progress: StoredLearnerProgress,
) {
  try {
    await persistLearnerProgress(
      createLocalLearnerProgressPersistence(storage),
      progress,
    );
  } catch {
    // Keep the learning flow available if browser storage is unavailable.
  }

  try {
    await fetch("/api/learner-progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(progress),
    });
  } catch {
    // Keep the learning flow available if remote persistence is unavailable.
  }
}
