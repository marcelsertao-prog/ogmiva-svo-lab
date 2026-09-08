import type { ActivityEngine, LearningActivity } from "@seal-sdk/activity";
import type { SessionEngine, SessionState } from "@seal-sdk/session";
import {
  checkListening04Answer,
  startListening04Session,
} from "./listening-04.ts";

export type Listening05Role = "Subject" | "Verb" | "Object";

export type Listening05Tile = {
  id: string;
  label: string;
  role: Listening05Role;
};

export type Listening05Slots = Record<Listening05Role, Listening05Tile>;

export const listening05InitialTiles: Listening05Tile[] = [
  { id: "listening-05-movies", label: "movies", role: "Object" },
  { id: "listening-05-plays", label: "plays", role: "Verb" },
  { id: "listening-05-carlos", label: "Carlos", role: "Subject" },
  { id: "listening-05-books", label: "books", role: "Object" },
  { id: "listening-05-watches", label: "watches", role: "Verb" },
];

export const listening05Prompt = "Carlos watches movies.";

export const listening05Activity: LearningActivity = {
  id: "LISTEN-SVO-05",
  title: "Apply SVO role mapping to a new sentence",
  type: "sentence-construction",
  level: "sentence",
  pattern: "SVO",
  availableUnits: listening05InitialTiles.map((tile) => tile.label),
  expectedUnits: ["Carlos", "watches", "movies"],
  skillIds: ["basic-svo-listening-role-identification"],
};

export const startListening05Session = startListening04Session;
export const checkListening05Answer = checkListening04Answer;

export async function restartListening05({
  completedSession,
  activity,
  activityEngine,
  sessionEngine,
}: {
  completedSession: SessionState;
  activity: LearningActivity;
  activityEngine: ActivityEngine;
  sessionEngine: SessionEngine;
}): Promise<{
  session: SessionState;
  feedback: "idle" | "correct";
  slots: Partial<Listening05Slots>;
  availableTiles: Listening05Tile[];
}> {
  const session = await startListening05Session({
    learnerId: completedSession.learnerId,
    activity,
    activityEngine,
    sessionEngine,
  });

  return {
    session,
    feedback: "idle",
    slots: {},
    availableTiles: [...listening05InitialTiles],
  };
}
