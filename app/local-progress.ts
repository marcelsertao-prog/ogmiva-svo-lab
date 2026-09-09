import type { ProgressRecord } from "@seal-sdk/progress";

export type ActivityId = "SVO-01" | "SVO-02" | "SVO-03" | "SVO-04" | "SVO-05";
export type ListeningActivityId = "LISTEN-SVO-01" | "LISTEN-SVO-02" | "LISTEN-SVO-03" | "LISTEN-SVO-04" | "LISTEN-SVO-05";

export type StoredProgressRecord = Omit<ProgressRecord, "recordedAt"> & {
  recordedAt: string;
};

export type StoredLearnerProgress = {
  learnerId: string;
  completedActivityIds: ActivityId[];
  completedListeningActivityIds?: ListeningActivityId[];
  progressRecords?: StoredProgressRecord[];
};

export function restoreLearnerProgress(
  storedProgress: Partial<StoredLearnerProgress>,
  learnerId: string,
): {
  completedActivityIds: ActivityId[];
  isListening01Complete: boolean;
  isListening02Complete: boolean;
  isListening03Complete: boolean;
  isListening04Complete: boolean;
  isListening05Complete: boolean;
  progressRecords: ProgressRecord[];
} | null {
  if (
    storedProgress.learnerId !== learnerId
    || !Array.isArray(storedProgress.completedActivityIds)
  ) return null;

  return {
    completedActivityIds: storedProgress.completedActivityIds,
    progressRecords: Array.isArray(storedProgress.progressRecords)
      ? storedProgress.progressRecords
        .filter((record) => record.learnerId === learnerId)
        .map((record) => ({
          ...record,
          recordedAt: new Date(record.recordedAt),
        }))
      : [],
    isListening01Complete: Array.isArray(storedProgress.completedListeningActivityIds)
      && storedProgress.completedListeningActivityIds.includes("LISTEN-SVO-01"),
    isListening02Complete: Array.isArray(storedProgress.completedListeningActivityIds)
      && storedProgress.completedListeningActivityIds.includes("LISTEN-SVO-02"),
    isListening03Complete: Array.isArray(storedProgress.completedListeningActivityIds)
      && storedProgress.completedListeningActivityIds.includes("LISTEN-SVO-03"),
    isListening04Complete: Array.isArray(storedProgress.completedListeningActivityIds)
      && storedProgress.completedListeningActivityIds.includes("LISTEN-SVO-04"),
    isListening05Complete: Array.isArray(storedProgress.completedListeningActivityIds)
      && storedProgress.completedListeningActivityIds.includes("LISTEN-SVO-05"),
  };
}

export function completeListening01Progress(
  progress: StoredLearnerProgress,
  progressRecord?: ProgressRecord,
): StoredLearnerProgress {
  return {
    ...progress,
    ...(progressRecord ? {
      progressRecords: [
        ...(progress.progressRecords ?? []),
        {
          ...progressRecord,
          recordedAt: progressRecord.recordedAt.toISOString(),
        },
      ],
    } : {}),
    completedListeningActivityIds: [
      ...new Set([
        ...(progress.completedListeningActivityIds ?? []),
        "LISTEN-SVO-01" as const,
      ]),
    ],
  };
}

export function resetListening01Attempt(isListening01Complete: boolean): {
  feedback: "idle";
  isListening01Complete: boolean;
} {
  return { feedback: "idle", isListening01Complete };
}

export function completeListening02Progress(
  progress: StoredLearnerProgress,
): StoredLearnerProgress {
  return {
    ...progress,
    completedListeningActivityIds: [
      ...new Set([
        ...(progress.completedListeningActivityIds ?? []),
        "LISTEN-SVO-02" as const,
      ]),
    ],
  };
}

export function resetListening02Attempt(isListening02Complete: boolean): {
  feedback: "idle";
  isListening02Complete: boolean;
} {
  return { feedback: "idle", isListening02Complete };
}

export function completeListening03Progress(
  progress: StoredLearnerProgress,
): StoredLearnerProgress {
  return {
    ...progress,
    completedListeningActivityIds: [
      ...new Set([
        ...(progress.completedListeningActivityIds ?? []),
        "LISTEN-SVO-03" as const,
      ]),
    ],
  };
}

export function resetListening03Attempt(isListening03Complete: boolean): {
  feedback: "idle";
  isListening03Complete: boolean;
} {
  return { feedback: "idle", isListening03Complete };
}

export function completeListening04Progress(
  progress: StoredLearnerProgress,
): StoredLearnerProgress {
  return {
    ...progress,
    completedListeningActivityIds: [
      ...new Set([
        ...(progress.completedListeningActivityIds ?? []),
        "LISTEN-SVO-04" as const,
      ]),
    ],
  };
}

export function resetListening04Attempt(isListening04Complete: boolean): {
  feedback: "idle";
  isListening04Complete: boolean;
} {
  return { feedback: "idle", isListening04Complete };
}

export function completeListening05Progress(
  progress: StoredLearnerProgress,
): StoredLearnerProgress {
  return {
    ...progress,
    completedListeningActivityIds: [
      ...new Set([
        ...(progress.completedListeningActivityIds ?? []),
        "LISTEN-SVO-05" as const,
      ]),
    ],
  };
}

export function resetListening05Attempt(isListening05Complete: boolean): {
  feedback: "idle";
  isListening05Complete: boolean;
} {
  return { feedback: "idle", isListening05Complete };
}

export function canUnlockSvo02({
  isSvo01Complete,
  isListening01Complete,
}: {
  isSvo01Complete: boolean;
  isListening01Complete: boolean;
}): boolean {
  return isSvo01Complete && isListening01Complete;
}

export function canUnlockSvo03({
  isSvo02Complete,
  isListening02Complete,
}: {
  isSvo02Complete: boolean;
  isListening02Complete: boolean;
}): boolean {
  return isSvo02Complete && isListening02Complete;
}

export function canUnlockSvo04({
  isSvo03Complete,
  isListening03Complete,
}: {
  isSvo03Complete: boolean;
  isListening03Complete: boolean;
}): boolean {
  return isSvo03Complete && isListening03Complete;
}

export function canUnlockSvo05({
  isSvo04Complete,
  isListening04Complete,
}: {
  isSvo04Complete: boolean;
  isListening04Complete: boolean;
}): boolean {
  return isSvo04Complete && isListening04Complete;
}

export function canUnlockListening02({
  isSvo02Complete,
}: {
  isSvo02Complete: boolean;
}): boolean {
  return isSvo02Complete;
}

export function canUnlockListening03({
  isSvo03Complete,
}: {
  isSvo03Complete: boolean;
}): boolean {
  return isSvo03Complete;
}

export function canUnlockListening04({
  isSvo04Complete,
}: {
  isSvo04Complete: boolean;
}): boolean {
  return isSvo04Complete;
}

export function canUnlockListening05({
  isSvo05Complete,
}: {
  isSvo05Complete: boolean;
}): boolean {
  return isSvo05Complete;
}

export function canUnlockListening01({
  isSvo01Complete,
}: {
  isSvo01Complete: boolean;
}): boolean {
  return isSvo01Complete;
}
