"use client";

import { ActivityEngine } from "@seal-sdk/activity";
import { AssessmentEngine } from "@seal-sdk/assessment";
import { EventBus } from "@seal-sdk/events";
import { EvidenceEngine } from "@seal-sdk/evidence";
import { createSubmitAnswerInteraction } from "@seal-sdk/interaction";
import { DefaultProgressEngine } from "@seal-sdk/progress";
import { DefaultSessionEngine, type SessionState } from "@seal-sdk/session";
import { useEffect, useMemo, useState } from "react";
import { checkListening01Answer, listening01Activity } from "./listening-01";
import {
  canUnlockListening01,
  canUnlockListening02,
  canUnlockListening03,
  canUnlockListening04,
  canUnlockListening05,
  canUnlockSvo02,
  canUnlockSvo03,
  canUnlockSvo04,
  canUnlockSvo05,
  completeListening01Progress,
  completeListening02Progress,
  completeListening03Progress,
  completeListening04Progress,
  completeListening05Progress,
  resetListening01Attempt,
  resetListening02Attempt,
  resetListening03Attempt,
  resetListening04Attempt,
  resetListening05Attempt,
  restoreLearnerProgress,
  type ActivityId,
  type StoredLearnerProgress,
} from "./local-progress";
import {
  addListening02Tile,
  checkListening02Answer,
  listening02Activity,
  listening02InitialTiles,
  listening02Prompt,
  startListening02Session,
} from "./listening-02";
import {
  addListening03Tile,
  checkListening03Answer,
  listening03Activity,
  listening03InitialTiles,
  listening03Prompt,
  startListening03Session,
} from "./listening-03";
import {
  checkListening04Answer,
  listening04Activity,
  listening04InitialTiles,
  listening04Prompt,
  startListening04Session,
  type Listening04Role,
  type Listening04Slots,
} from "./listening-04";
import {
  checkListening05Answer,
  listening05Activity,
  listening05InitialTiles,
  listening05Prompt,
  restartListening05,
  startListening05Session,
  type Listening05Role,
  type Listening05Slots,
} from "./listening-05";

type Tile = {
  id: string;
  label: string;
  role: "Subject" | "Verb" | "Object";
};

type Feedback = "idle" | "incomplete" | "incorrect" | "correct";
type Listening04SlotState = Partial<Listening04Slots>;
type Listening05SlotState = Partial<Listening05Slots>;
type Screen = "journey" | "activity-1" | "activity-2" | "activity-3" | "activity-4" | "activity-5";

type SentenceChoice = {
  id: string;
  label: string;
};

type MasteryItem = {
  id: string;
  clue: string;
  expectedUnits: string[];
  tiles: Tile[];
};

const initialTiles: Tile[] = [
  { id: "music", label: "music", role: "Object" },
  { id: "anna", label: "Anna", role: "Subject" },
  { id: "likes", label: "likes", role: "Verb" },
];

const activity1ExpectedUnits = ["Anna", "likes", "music"];
const activity2ExpectedUnits = ["Anna likes music."];
const activity3ExpectedUnits = ["books"];
const activity4ExpectedUnits = ["Maya", "writes", "letters"];
const listeningPrompt = "Anna likes music.";
const activity4InitialTiles: Tile[] = [
  { id: "letters", label: "letters", role: "Object" },
  { id: "reads-distractor", label: "reads", role: "Verb" },
  { id: "maya", label: "Maya", role: "Subject" },
  { id: "daniel-distractor", label: "Daniel", role: "Subject" },
  { id: "writes", label: "writes", role: "Verb" },
];
const masteryItems: MasteryItem[] = [
  {
    id: "children-play",
    clue: "Build a sentence about children playing soccer.",
    expectedUnits: ["The children", "play", "soccer"],
    tiles: [
      { id: "soccer", label: "soccer", role: "Object" },
      { id: "plays-distractor", label: "plays", role: "Verb" },
      { id: "children", label: "The children", role: "Subject" },
      { id: "music-distractor", label: "music", role: "Object" },
      { id: "play", label: "play", role: "Verb" },
    ],
  },
  {
    id: "maria-drinks",
    clue: "Build a sentence about Maria drinking water.",
    expectedUnits: ["Maria", "drinks", "water"],
    tiles: [
      { id: "drink-distractor", label: "drink", role: "Verb" },
      { id: "water", label: "water", role: "Object" },
      { id: "maria", label: "Maria", role: "Subject" },
      { id: "juice-distractor", label: "juice", role: "Object" },
      { id: "drinks", label: "drinks", role: "Verb" },
    ],
  },
  {
    id: "brother-watches",
    clue: "Build a sentence about your brother watching movies.",
    expectedUnits: ["My brother", "watches", "movies"],
    tiles: [
      { id: "movies", label: "movies", role: "Object" },
      { id: "watch-distractor", label: "watch", role: "Verb" },
      { id: "brother", label: "My brother", role: "Subject" },
      { id: "books-distractor", label: "books", role: "Object" },
      { id: "watches", label: "watches", role: "Verb" },
    ],
  },
];
const sentenceChoices: SentenceChoice[] = [
  { id: "subject-first", label: "Anna likes music." },
  { id: "verb-first", label: "Likes Anna music." },
  { id: "object-first", label: "Music Anna likes." },
];
const completionChoices: SentenceChoice[] = [
  { id: "object", label: "books" },
  { id: "verb", label: "reads" },
  { id: "subject", label: "Daniel" },
];
const learnerId = "learner-1";
const listening04VisualRoles: Listening04Role[] = ["Verb", "Object", "Subject"];
const listening05VisualRoles: Listening05Role[] = ["Verb", "Object", "Subject"];
const progressStorageKey = `spread11:${learnerId}:svo-progress`;
const evidenceEngine = new EvidenceEngine();
const assessmentEngine = new AssessmentEngine();
const progressEngine = new DefaultProgressEngine();
const activityEngine = new ActivityEngine();
activityEngine.register(listening01Activity);
const sessionEngine = new DefaultSessionEngine(new EventBus(), activityEngine);

export default function Home() {
  const [screen, setScreen] = useState<Screen>("journey");
  const [isSvo01Complete, setIsSvo01Complete] = useState(false);
  const [isSvo02Complete, setIsSvo02Complete] = useState(false);
  const [isSvo03Complete, setIsSvo03Complete] = useState(false);
  const [isSvo04Complete, setIsSvo04Complete] = useState(false);
  const [isSvo05Complete, setIsSvo05Complete] = useState(false);
  const [available, setAvailable] = useState(initialTiles);
  const [answer, setAnswer] = useState<Tile[]>([]);
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [activity2Feedback, setActivity2Feedback] = useState<Feedback>("idle");
  const [selectedCompletion, setSelectedCompletion] = useState<string | null>(null);
  const [activity3Feedback, setActivity3Feedback] = useState<Feedback>("idle");
  const [challengeAvailable, setChallengeAvailable] = useState(activity4InitialTiles);
  const [challengeAnswer, setChallengeAnswer] = useState<Tile[]>([]);
  const [activity4Feedback, setActivity4Feedback] = useState<Feedback>("idle");
  const [masteryIndex, setMasteryIndex] = useState(0);
  const [masteryAvailable, setMasteryAvailable] = useState(masteryItems[0].tiles);
  const [masteryAnswer, setMasteryAnswer] = useState<Tile[]>([]);
  const [activity5Feedback, setActivity5Feedback] = useState<Feedback>("idle");
  const [hasPlayedListeningPrompt, setHasPlayedListeningPrompt] = useState(false);
  const [isListeningPlaying, setIsListeningPlaying] = useState(false);
  const [listeningAudioError, setListeningAudioError] = useState(false);
  const [selectedListeningChoice, setSelectedListeningChoice] = useState<string | null>(null);
  const [listeningFeedback, setListeningFeedback] = useState<Feedback>("idle");
  const [isListening01Complete, setIsListening01Complete] = useState(false);
  const [listening01Session, setListening01Session] = useState<SessionState | null>(null);
  const [hasPlayedListening02Prompt, setHasPlayedListening02Prompt] = useState(false);
  const [isListening02Playing, setIsListening02Playing] = useState(false);
  const [listening02AudioError, setListening02AudioError] = useState(false);
  const [listening02Available, setListening02Available] = useState(listening02InitialTiles);
  const [listening02Answer, setListening02Answer] = useState<Tile[]>([]);
  const [listening02Feedback, setListening02Feedback] = useState<Feedback>("idle");
  const [isListening02Complete, setIsListening02Complete] = useState(false);
  const [listening02Session, setListening02Session] = useState<SessionState | null>(null);
  const [hasPlayedListening03Prompt, setHasPlayedListening03Prompt] = useState(false);
  const [isListening03Playing, setIsListening03Playing] = useState(false);
  const [listening03AudioError, setListening03AudioError] = useState(false);
  const [listening03Available, setListening03Available] = useState(listening03InitialTiles);
  const [listening03Answer, setListening03Answer] = useState<Tile[]>([]);
  const [listening03Feedback, setListening03Feedback] = useState<Feedback>("idle");
  const [isListening03Complete, setIsListening03Complete] = useState(false);
  const [listening03Session, setListening03Session] = useState<SessionState | null>(null);
  const [hasPlayedListening04Prompt, setHasPlayedListening04Prompt] = useState(false);
  const [isListening04Playing, setIsListening04Playing] = useState(false);
  const [listening04AudioError, setListening04AudioError] = useState(false);
  const [listening04Available, setListening04Available] = useState(listening04InitialTiles);
  const [listening04Slots, setListening04Slots] = useState<Listening04SlotState>({});
  const [listening04ActiveRole, setListening04ActiveRole] = useState<Listening04Role>("Verb");
  const [listening04Feedback, setListening04Feedback] = useState<Feedback>("idle");
  const [isListening04Complete, setIsListening04Complete] = useState(false);
  const [listening04Session, setListening04Session] = useState<SessionState | null>(null);
  const [hasPlayedListening05Prompt, setHasPlayedListening05Prompt] = useState(false);
  const [isListening05Playing, setIsListening05Playing] = useState(false);
  const [listening05Session, setListening05Session] = useState<SessionState | null>(null);
  const [listening05Available, setListening05Available] = useState(listening05InitialTiles);
  const [listening05Slots, setListening05Slots] = useState<Listening05SlotState>({});
  const [listening05ActiveRole, setListening05ActiveRole] = useState<Listening05Role>("Verb");
  const [listening05Feedback, setListening05Feedback] = useState<Feedback>("idle");
  const [isListening05Complete, setIsListening05Complete] = useState(false);

  const sentence = useMemo(
    () => answer.map((tile) => tile.label).join(" "),
    [answer],
  );
  const isSvo02Unlocked = canUnlockSvo02({
    isSvo01Complete,
    isListening01Complete,
  });
  const isSvo03Unlocked = canUnlockSvo03({
    isSvo02Complete,
    isListening02Complete,
  });
  const isSvo04Unlocked = canUnlockSvo04({
    isSvo03Complete,
    isListening03Complete,
  });
  const isSvo05Unlocked = canUnlockSvo05({
    isSvo04Complete,
    isListening04Complete,
  });
  const isListening01Unlocked = canUnlockListening01({ isSvo01Complete });
  const isListening02Unlocked = canUnlockListening02({ isSvo02Complete });
  const isListening03Unlocked = canUnlockListening03({ isSvo03Complete });
  const isListening04Unlocked = canUnlockListening04({ isSvo04Complete });
  const isListening05Unlocked = canUnlockListening05({ isSvo05Complete });
  const stage01CompletedCount = Number(isSvo01Complete) + Number(isListening01Complete);
  const stage01State = isListening01Complete ? "complete" : "current";
  const listening01State = isListening01Complete
    ? "complete"
    : isListening01Unlocked
      ? "current"
      : "locked";
  const stage02CompletedCount = Number(isSvo02Complete) + Number(isListening02Complete);
  const stage02State = isListening02Complete
    ? "complete"
    : isSvo02Unlocked
      ? "current"
      : "locked";
  const svo02State = isSvo02Complete
    ? "complete"
    : isSvo02Unlocked
      ? "current"
      : "locked";
  const listening02State = isListening02Complete
    ? "complete"
    : isListening02Unlocked
      ? "current"
      : "locked";
  const stage03CompletedCount = Number(isSvo03Complete) + Number(isListening03Complete);
  const stage03State = isListening03Complete
    ? "complete"
    : isSvo03Unlocked
      ? "current"
      : "locked";
  const svo03State = isSvo03Complete
    ? "complete"
    : isSvo03Unlocked
      ? "current"
      : "locked";
  const listening03State = isListening03Complete
    ? "complete"
    : isListening03Unlocked
      ? "current"
      : "locked";
  const stage04CompletedCount = Number(isSvo04Complete) + Number(isListening04Complete);
  const stage04State = isListening04Complete
    ? "complete"
    : isSvo04Unlocked
      ? "current"
      : "locked";
  const svo04State = isSvo04Complete
    ? "complete"
    : isSvo04Unlocked
      ? "current"
      : "locked";
  const listening04State = isListening04Complete
    ? "complete"
    : isListening04Unlocked
      ? "current"
      : "locked";
  const stage05CompletedCount = Number(isSvo05Complete) + Number(isListening05Complete);
  const stage05State = isListening05Complete
    ? "complete"
    : isSvo05Unlocked
      ? "current"
      : "locked";
  const svo05State = isSvo05Complete
    ? "complete"
    : isSvo05Unlocked
      ? "current"
      : "locked";
  const listening05State = isListening05Complete
    ? "complete"
    : isListening05Unlocked
      ? "current"
      : "locked";

  useEffect(() => {
    const restoreProgress = window.setTimeout(() => {
      try {
        const storedProgress = window.localStorage.getItem(progressStorageKey);
        if (!storedProgress) return;

        const parsedProgress = JSON.parse(storedProgress) as Partial<StoredLearnerProgress>;
        const restoredProgress = restoreLearnerProgress(parsedProgress, learnerId);
        if (!restoredProgress) return;

        const hasCompletedSvo01 = restoredProgress.completedActivityIds.includes("SVO-01");
        const hasCompletedSvo02 = hasCompletedSvo01 && restoredProgress.completedActivityIds.includes("SVO-02");
        const hasCompletedSvo03 = hasCompletedSvo02 && restoredProgress.completedActivityIds.includes("SVO-03");
        const hasCompletedSvo04 = hasCompletedSvo03 && restoredProgress.completedActivityIds.includes("SVO-04");
        const hasCompletedSvo05 = hasCompletedSvo04 && restoredProgress.completedActivityIds.includes("SVO-05");

        setIsSvo01Complete(hasCompletedSvo01);
        setIsSvo02Complete(hasCompletedSvo02);
        setIsSvo03Complete(hasCompletedSvo03);
        setIsSvo04Complete(hasCompletedSvo04);
        setIsSvo05Complete(hasCompletedSvo05);
        setIsListening01Complete(restoredProgress.isListening01Complete);
        setIsListening02Complete(restoredProgress.isListening02Complete);
        setIsListening03Complete(restoredProgress.isListening03Complete);
        setIsListening04Complete(restoredProgress.isListening04Complete);
        setIsListening05Complete(restoredProgress.isListening05Complete);
      } catch {
        // Ignore invalid device-local progress and keep the initial journey state.
      }
    }, 0);

    return () => window.clearTimeout(restoreProgress);
  }, []);

  function persistCompletedActivities(completedActivityIds: ActivityId[]) {
    const progress: StoredLearnerProgress = {
      learnerId,
      completedActivityIds,
      completedListeningActivityIds: [
        ...(isListening01Complete ? ["LISTEN-SVO-01" as const] : []),
        ...(isListening02Complete ? ["LISTEN-SVO-02" as const] : []),
        ...(isListening03Complete ? ["LISTEN-SVO-03" as const] : []),
        ...(isListening04Complete ? ["LISTEN-SVO-04" as const] : []),
        ...(isListening05Complete ? ["LISTEN-SVO-05" as const] : []),
      ],
    };

    persistProgress(progress);
  }

  function persistProgress(progress: StoredLearnerProgress) {
    try {
      const storedProgress = window.localStorage.getItem(progressStorageKey);
      const restoredProgress = storedProgress
        ? restoreLearnerProgress(JSON.parse(storedProgress), progress.learnerId)
        : null;
      const nextProgress = progress.progressRecords === undefined && restoredProgress
        ? { ...progress, progressRecords: restoredProgress.progressRecords }
        : progress;

      window.localStorage.setItem(progressStorageKey, JSON.stringify(nextProgress));
    } catch {
      // Keep the learning flow available if browser storage is unavailable.
    }
  }

  function addToAnswer(tile: Tile) {
    setAvailable((current) => current.filter((item) => item.id !== tile.id));
    setAnswer((current) => [...current, tile]);
    setFeedback("idle");
  }

  function returnToBank(tile: Tile) {
    setAnswer((current) => current.filter((item) => item.id !== tile.id));
    setAvailable((current) => [...current, tile]);
    setFeedback("idle");
  }

  function resetActivity() {
    setAvailable(initialTiles);
    setAnswer([]);
    setFeedback("idle");
  }

  function resetActivity2() {
    setSelectedChoice(null);
    setActivity2Feedback("idle");
  }

  function resetActivity3() {
    setSelectedCompletion(null);
    setActivity3Feedback("idle");
  }

  function addToChallenge(tile: Tile) {
    if (challengeAnswer.length >= activity4ExpectedUnits.length) return;
    setChallengeAvailable((current) => current.filter((item) => item.id !== tile.id));
    setChallengeAnswer((current) => [...current, tile]);
    setActivity4Feedback("idle");
  }

  function returnToChallengeBank(tile: Tile) {
    setChallengeAnswer((current) => current.filter((item) => item.id !== tile.id));
    setChallengeAvailable((current) => [...current, tile]);
    setActivity4Feedback("idle");
  }

  function resetActivity4() {
    setChallengeAvailable(activity4InitialTiles);
    setChallengeAnswer([]);
    setActivity4Feedback("idle");
  }

  function addToMastery(tile: Tile) {
    if (masteryAnswer.length >= masteryItems[masteryIndex].expectedUnits.length) return;
    setMasteryAvailable((current) => current.filter((item) => item.id !== tile.id));
    setMasteryAnswer((current) => [...current, tile]);
    setActivity5Feedback("idle");
  }

  function returnToMasteryBank(tile: Tile) {
    setMasteryAnswer((current) => current.filter((item) => item.id !== tile.id));
    setMasteryAvailable((current) => [...current, tile]);
    setActivity5Feedback("idle");
  }

  function resetActivity5(index = 0) {
    setMasteryIndex(index);
    setMasteryAvailable(masteryItems[index].tiles);
    setMasteryAnswer([]);
    setActivity5Feedback("idle");
  }

  function resetListeningExperiment() {
    const resetState = resetListening01Attempt(isListening01Complete);

    window.speechSynthesis?.cancel();
    setHasPlayedListeningPrompt(false);
    setIsListeningPlaying(false);
    setListeningAudioError(false);
    setSelectedListeningChoice(null);
    setListeningFeedback(resetState.feedback);
    setIsListening01Complete(resetState.isListening01Complete);
    setListening01Session(null);
  }

  async function ensureListening01Session() {
    if (listening01Session?.status === "active") return listening01Session;

    const createdSession = await sessionEngine.createSession({
      learnerId,
      activityId: listening01Activity.id,
    });
    const session = await sessionEngine.startSession(createdSession.sessionId);
    setListening01Session(session);
    return session;
  }

  async function playListeningPrompt() {
    if (!isListening01Unlocked) return;

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setListeningAudioError(true);
      return;
    }

    await ensureListening01Session();

    const utterance = new SpeechSynthesisUtterance(listeningPrompt);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.onend = () => {
      setIsListeningPlaying(false);
      setHasPlayedListeningPrompt(true);
    };
    utterance.onerror = () => {
      setIsListeningPlaying(false);
      setListeningAudioError(true);
    };

    setListeningAudioError(false);
    setIsListeningPlaying(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function addToListening02Answer(tile: Tile) {
    setListening02Available((current) => current.filter((item) => item.id !== tile.id));
    setListening02Answer((current) => addListening02Tile(current, tile));
    setListening02Feedback("idle");
  }

  function returnToListening02Bank(tile: Tile) {
    setListening02Answer((current) => current.filter((item) => item.id !== tile.id));
    setListening02Available((current) => [...current, tile]);
    setListening02Feedback("idle");
  }

  function resetListening02() {
    const resetState = resetListening02Attempt(isListening02Complete);

    window.speechSynthesis?.cancel();
    setHasPlayedListening02Prompt(false);
    setIsListening02Playing(false);
    setListening02AudioError(false);
    setListening02Available(listening02InitialTiles);
    setListening02Answer([]);
    setListening02Feedback(resetState.feedback);
    setIsListening02Complete(resetState.isListening02Complete);
    setListening02Session(null);
  }

  async function ensureListening02Session() {
    if (listening02Session?.status === "active") return listening02Session;

    const session = await startListening02Session({
      learnerId,
      activity: listening02Activity,
      activityEngine,
      sessionEngine,
    });
    setListening02Session(session);
    return session;
  }

  async function playListening02Prompt() {
    if (!isListening02Unlocked) return;

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setListening02AudioError(true);
      return;
    }

    await ensureListening02Session();

    const utterance = new SpeechSynthesisUtterance(listening02Prompt);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.onend = () => {
      setIsListening02Playing(false);
      setHasPlayedListening02Prompt(true);
    };
    utterance.onerror = () => {
      setIsListening02Playing(false);
      setListening02AudioError(true);
    };

    setListening02AudioError(false);
    setIsListening02Playing(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function checkListeningChoice() {
    const session = await ensureListening01Session();
    const result = await checkListening01Answer({
      selectedAnswer: selectedListeningChoice,
      activity: listening01Activity,
      session,
      evidenceEngine,
      assessmentEngine,
      progressEngine,
      sessionEngine,
    });

    setListening01Session(result.session);
    setListeningFeedback(result.feedback);

    if (result.feedback === "correct") {
      const completedActivityIds: ActivityId[] = [];
      if (isSvo01Complete) completedActivityIds.push("SVO-01");
      if (isSvo02Complete) completedActivityIds.push("SVO-02");
      if (isSvo03Complete) completedActivityIds.push("SVO-03");
      if (isSvo04Complete) completedActivityIds.push("SVO-04");
      if (isSvo05Complete) completedActivityIds.push("SVO-05");

      persistProgress(completeListening01Progress({
        learnerId,
        completedActivityIds,
        completedListeningActivityIds: [
          ...(isListening01Complete ? ["LISTEN-SVO-01" as const] : []),
          ...(isListening02Complete ? ["LISTEN-SVO-02" as const] : []),
          ...(isListening03Complete ? ["LISTEN-SVO-03" as const] : []),
          ...(isListening04Complete ? ["LISTEN-SVO-04" as const] : []),
          ...(isListening05Complete ? ["LISTEN-SVO-05" as const] : []),
        ],
      }, result.progress));
      setIsListening01Complete(true);
    }
  }

  async function handleListening02Answer() {
    if (!isListening02Unlocked) return;

    const session = await ensureListening02Session();
    const result = await checkListening02Answer({
      answer: listening02Answer,
      activity: listening02Activity,
      session,
      evidenceEngine,
      assessmentEngine,
      progressEngine,
      sessionEngine,
    });

    setListening02Session(result.session);
    setListening02Feedback(result.feedback);

    if (result.feedback === "correct") {
      const completedActivityIds: ActivityId[] = [];
      if (isSvo01Complete) completedActivityIds.push("SVO-01");
      if (isSvo02Complete) completedActivityIds.push("SVO-02");
      if (isSvo03Complete) completedActivityIds.push("SVO-03");
      if (isSvo04Complete) completedActivityIds.push("SVO-04");
      if (isSvo05Complete) completedActivityIds.push("SVO-05");

      persistProgress(completeListening02Progress({
        learnerId,
        completedActivityIds,
        completedListeningActivityIds: [
          ...(isListening01Complete ? ["LISTEN-SVO-01" as const] : []),
          ...(isListening02Complete ? ["LISTEN-SVO-02" as const] : []),
          ...(isListening03Complete ? ["LISTEN-SVO-03" as const] : []),
          ...(isListening04Complete ? ["LISTEN-SVO-04" as const] : []),
          ...(isListening05Complete ? ["LISTEN-SVO-05" as const] : []),
        ],
      }));
      setIsListening02Complete(true);
    }
  }

  function addToListening03Answer(tile: Tile) {
    if (listening03Answer.length >= listening03Activity.expectedUnits.length) return;

    setListening03Available((current) => current.filter((item) => item.id !== tile.id));
    setListening03Answer((current) => addListening03Tile(
      current,
      tile,
      listening03Activity.expectedUnits.length,
    ));
    setListening03Feedback("idle");
  }

  function returnToListening03Bank(tile: Tile) {
    setListening03Answer((current) => current.filter((item) => item.id !== tile.id));
    setListening03Available((current) => [...current, tile]);
    setListening03Feedback("idle");
  }

  function resetListening03() {
    const resetState = resetListening03Attempt(isListening03Complete);

    window.speechSynthesis?.cancel();
    setHasPlayedListening03Prompt(false);
    setIsListening03Playing(false);
    setListening03AudioError(false);
    setListening03Available(listening03InitialTiles);
    setListening03Answer([]);
    setListening03Feedback(resetState.feedback);
    setIsListening03Complete(resetState.isListening03Complete);
    setListening03Session(null);
  }

  async function ensureListening03Session() {
    if (listening03Session?.status === "active") return listening03Session;

    const session = await startListening03Session({
      learnerId,
      activity: listening03Activity,
      activityEngine,
      sessionEngine,
    });
    setListening03Session(session);
    return session;
  }

  async function playListening03Prompt() {
    if (!isListening03Unlocked) return;

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setListening03AudioError(true);
      return;
    }

    await ensureListening03Session();

    const utterance = new SpeechSynthesisUtterance(listening03Prompt);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.onend = () => {
      setIsListening03Playing(false);
      setHasPlayedListening03Prompt(true);
    };
    utterance.onerror = () => {
      setIsListening03Playing(false);
      setListening03AudioError(true);
    };

    setListening03AudioError(false);
    setIsListening03Playing(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function handleListening03Answer() {
    if (!isListening03Unlocked) return;

    const session = await ensureListening03Session();
    const result = await checkListening03Answer({
      answer: listening03Answer,
      activity: listening03Activity,
      session,
      evidenceEngine,
      assessmentEngine,
      progressEngine,
      sessionEngine,
    });

    setListening03Session(result.session);
    setListening03Feedback(result.feedback);

    if (result.feedback === "correct") {
      const completedActivityIds: ActivityId[] = [];
      if (isSvo01Complete) completedActivityIds.push("SVO-01");
      if (isSvo02Complete) completedActivityIds.push("SVO-02");
      if (isSvo03Complete) completedActivityIds.push("SVO-03");
      if (isSvo04Complete) completedActivityIds.push("SVO-04");
      if (isSvo05Complete) completedActivityIds.push("SVO-05");

      persistProgress(completeListening03Progress({
        learnerId,
        completedActivityIds,
        completedListeningActivityIds: [
          ...(isListening01Complete ? ["LISTEN-SVO-01" as const] : []),
          ...(isListening02Complete ? ["LISTEN-SVO-02" as const] : []),
          ...(isListening03Complete ? ["LISTEN-SVO-03" as const] : []),
          ...(isListening04Complete ? ["LISTEN-SVO-04" as const] : []),
          ...(isListening05Complete ? ["LISTEN-SVO-05" as const] : []),
        ],
      }));
      setIsListening03Complete(true);
    }
  }

  function assignListening04Tile(tile: Tile) {
    if (listening04Feedback === "correct") return;

    const role = listening04ActiveRole;
    const previousTile = listening04Slots[role];
    setListening04Slots((current) => ({ ...current, [role]: tile }));
    setListening04Available((current) => [
      ...current.filter((item) => item.id !== tile.id),
      ...(previousTile ? [previousTile] : []),
    ]);
    setListening04Feedback("idle");
  }

  function removeListening04Tile(role: Listening04Role) {
    const tile = listening04Slots[role];
    if (!tile || listening04Feedback === "correct") return;

    setListening04Slots((current) => {
      const next = { ...current };
      delete next[role];
      return next;
    });
    setListening04Available((current) => [...current, tile]);
    setListening04ActiveRole(role);
    setListening04Feedback("idle");
  }

  function resetListening04() {
    const resetState = resetListening04Attempt(isListening04Complete);

    window.speechSynthesis?.cancel();
    setHasPlayedListening04Prompt(false);
    setIsListening04Playing(false);
    setListening04AudioError(false);
    setListening04Available(listening04InitialTiles);
    setListening04Slots({});
    setListening04ActiveRole("Verb");
    setListening04Feedback(resetState.feedback);
    setIsListening04Complete(resetState.isListening04Complete);
    setListening04Session(null);
  }

  async function ensureListening04Session() {
    if (listening04Session?.status === "active") return listening04Session;

    const session = await startListening04Session({
      learnerId,
      activity: listening04Activity,
      activityEngine,
      sessionEngine,
    });
    setListening04Session(session);
    return session;
  }

  async function playListening04Prompt() {
    if (!isListening04Unlocked) return;

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setListening04AudioError(true);
      return;
    }

    await ensureListening04Session();

    const utterance = new SpeechSynthesisUtterance(listening04Prompt);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.onend = () => {
      setIsListening04Playing(false);
      setHasPlayedListening04Prompt(true);
    };
    utterance.onerror = () => {
      setIsListening04Playing(false);
      setListening04AudioError(true);
    };

    setListening04AudioError(false);
    setIsListening04Playing(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function handleListening04Answer() {
    if (!isListening04Unlocked) return;

    const { Subject, Verb, Object } = listening04Slots;
    if (!Subject || !Verb || !Object) return;

    const session = await ensureListening04Session();
    const result = await checkListening04Answer({
      slots: { Subject, Verb, Object },
      activity: listening04Activity,
      session,
      evidenceEngine,
      assessmentEngine,
      progressEngine,
      sessionEngine,
    });

    setListening04Session(result.session);
    setListening04Feedback(result.feedback);

    if (result.feedback === "correct") {
      const completedActivityIds: ActivityId[] = [];
      if (isSvo01Complete) completedActivityIds.push("SVO-01");
      if (isSvo02Complete) completedActivityIds.push("SVO-02");
      if (isSvo03Complete) completedActivityIds.push("SVO-03");
      if (isSvo04Complete) completedActivityIds.push("SVO-04");
      if (isSvo05Complete) completedActivityIds.push("SVO-05");

      persistProgress(completeListening04Progress({
        learnerId,
        completedActivityIds,
        completedListeningActivityIds: [
          ...(isListening01Complete ? ["LISTEN-SVO-01" as const] : []),
          ...(isListening02Complete ? ["LISTEN-SVO-02" as const] : []),
          ...(isListening03Complete ? ["LISTEN-SVO-03" as const] : []),
          ...(isListening04Complete ? ["LISTEN-SVO-04" as const] : []),
          ...(isListening05Complete ? ["LISTEN-SVO-05" as const] : []),
        ],
      }));
      setIsListening04Complete(true);
    }
  }

  async function ensureListening05Session() {
    if (listening05Session?.status === "active") return listening05Session;

    const session = await startListening05Session({
      learnerId,
      activity: listening05Activity,
      activityEngine,
      sessionEngine,
    });
    setListening05Session(session);
    return session;
  }

  async function playListening05Prompt() {
    if (!isListening05Unlocked) return;

    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;

    await ensureListening05Session();

    const utterance = new SpeechSynthesisUtterance(listening05Prompt);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.onend = () => {
      setIsListening05Playing(false);
      setHasPlayedListening05Prompt(true);
    };
    utterance.onerror = () => setIsListening05Playing(false);

    setIsListening05Playing(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function assignListening05Tile(tile: Tile) {
    if (listening05Feedback === "correct") return;

    const role = listening05ActiveRole;
    const previousTile = listening05Slots[role];

    setListening05Slots((current) => ({ ...current, [role]: tile }));
    setListening05Available((current) => [
      ...current.filter((item) => item.id !== tile.id),
      ...(previousTile ? [previousTile] : []),
    ]);
    setListening05Feedback("idle");
  }

  function removeListening05Tile(role: Listening05Role) {
    const tile = listening05Slots[role];
    if (!tile || listening05Feedback === "correct") return;

    setListening05Slots((current) => {
      const next = { ...current };
      delete next[role];
      return next;
    });
    setListening05Available((current) => [...current, tile]);
    setListening05ActiveRole(role);
    setListening05Feedback("idle");
  }

  async function handleListening05Answer() {
    if (!isListening05Unlocked) return;

    const { Subject, Verb, Object } = listening05Slots;
    if (!Subject || !Verb || !Object) return;

    const session = await ensureListening05Session();
    const result = await checkListening05Answer({
      slots: { Subject, Verb, Object },
      activity: listening05Activity,
      session,
      evidenceEngine,
      assessmentEngine,
      progressEngine,
      sessionEngine,
    });

    setListening05Session(result.session);
    setListening05Feedback(result.feedback);

    if (result.feedback === "correct") {
      const completedActivityIds: ActivityId[] = [];
      if (isSvo01Complete) completedActivityIds.push("SVO-01");
      if (isSvo02Complete) completedActivityIds.push("SVO-02");
      if (isSvo03Complete) completedActivityIds.push("SVO-03");
      if (isSvo04Complete) completedActivityIds.push("SVO-04");
      if (isSvo05Complete) completedActivityIds.push("SVO-05");

      persistProgress(completeListening05Progress({
        learnerId,
        completedActivityIds,
        completedListeningActivityIds: [
          ...(isListening01Complete ? ["LISTEN-SVO-01" as const] : []),
          ...(isListening02Complete ? ["LISTEN-SVO-02" as const] : []),
          ...(isListening03Complete ? ["LISTEN-SVO-03" as const] : []),
          ...(isListening04Complete ? ["LISTEN-SVO-04" as const] : []),
          ...(isListening05Complete ? ["LISTEN-SVO-05" as const] : []),
        ],
      }));
      setIsListening05Complete(true);
    }
  }

  async function resetListening05() {
    if (!listening05Session || listening05Session.status !== "completed") return;

    window.speechSynthesis?.cancel();
    const restarted = await restartListening05({
      completedSession: listening05Session,
      activity: listening05Activity,
      activityEngine,
      sessionEngine,
    });

    setHasPlayedListening05Prompt(false);
    setIsListening05Playing(false);
    setListening05Session(restarted.session);
    setListening05Available(restarted.availableTiles);
    setListening05Slots(restarted.slots);
    setListening05ActiveRole("Verb");
    const resetState = resetListening05Attempt(isListening05Complete);
    setListening05Feedback(resetState.feedback);
    setIsListening05Complete(resetState.isListening05Complete);
  }

  function openActivity1() {
    resetActivity();
    setScreen("activity-1");
  }

  function openActivity2() {
    if (!isSvo02Unlocked) return;
    resetActivity2();
    setScreen("activity-2");
  }

  function openActivity3() {
    if (!isSvo03Unlocked) return;
    resetActivity3();
    setScreen("activity-3");
  }

  function openActivity4() {
    if (!isSvo04Unlocked) return;
    resetActivity4();
    setScreen("activity-4");
  }

  function openActivity5() {
    if (!isSvo05Unlocked) return;
    resetActivity5();
    setScreen("activity-5");
  }

  function returnToJourney() {
    resetActivity();
    resetActivity2();
    resetActivity3();
    resetActivity4();
    resetActivity5();
    setScreen("journey");
  }

  async function checkSentence() {
    if (answer.length !== initialTiles.length) {
      setFeedback("incomplete");
      return;
    }

    const interaction = createSubmitAnswerInteraction({
      sessionId: "svo-01-session",
      learnerId,
      submittedUnits: answer.map((tile) => tile.label),
    });
    const evidence = evidenceEngine.capture(interaction);
    const assessment = assessmentEngine.assess({ evidence, expectedUnits: activity1ExpectedUnits });

    await progressEngine.recordAssessment({
      assessment,
      activityId: "SVO-01",
      skillId: "basic-svo-construction",
      timeSpentSeconds: 0,
    });

    setFeedback(assessment.correct ? "correct" : "incorrect");

    if (assessment.correct) {
      const completedActivityIds: ActivityId[] = ["SVO-01"];
      if (isSvo02Complete) completedActivityIds.push("SVO-02");
      if (isSvo03Complete) completedActivityIds.push("SVO-03");
      if (isSvo04Complete) completedActivityIds.push("SVO-04");
      if (isSvo05Complete) completedActivityIds.push("SVO-05");
      persistCompletedActivities(completedActivityIds);
      window.setTimeout(() => {
        setIsSvo01Complete(true);
        returnToJourney();
      }, 1400);
    }
  }

  async function checkSentenceChoice() {
    if (!selectedChoice) {
      setActivity2Feedback("incomplete");
      return;
    }

    const interaction = createSubmitAnswerInteraction({
      sessionId: "svo-02-session",
      learnerId,
      submittedUnits: [selectedChoice],
    });
    const evidence = evidenceEngine.capture(interaction);
    const assessment = assessmentEngine.assess({ evidence, expectedUnits: activity2ExpectedUnits });

    await progressEngine.recordAssessment({
      assessment,
      activityId: "SVO-02",
      skillId: "basic-svo-construction",
      timeSpentSeconds: 0,
    });

    setActivity2Feedback(assessment.correct ? "correct" : "incorrect");

    if (assessment.correct) {
      const completedActivityIds: ActivityId[] = ["SVO-01", "SVO-02"];
      if (isSvo03Complete) completedActivityIds.push("SVO-03");
      if (isSvo04Complete) completedActivityIds.push("SVO-04");
      if (isSvo05Complete) completedActivityIds.push("SVO-05");
      persistCompletedActivities(completedActivityIds);
      window.setTimeout(() => {
        setIsSvo02Complete(true);
        returnToJourney();
      }, 1400);
    }
  }

  async function checkSentenceCompletion() {
    if (!selectedCompletion) {
      setActivity3Feedback("incomplete");
      return;
    }

    const interaction = createSubmitAnswerInteraction({
      sessionId: "svo-03-session",
      learnerId,
      submittedUnits: [selectedCompletion],
    });
    const evidence = evidenceEngine.capture(interaction);
    const assessment = assessmentEngine.assess({ evidence, expectedUnits: activity3ExpectedUnits });

    await progressEngine.recordAssessment({
      assessment,
      activityId: "SVO-03",
      skillId: "basic-svo-construction",
      timeSpentSeconds: 0,
    });

    setActivity3Feedback(assessment.correct ? "correct" : "incorrect");

    if (assessment.correct) {
      const completedActivityIds: ActivityId[] = ["SVO-01", "SVO-02", "SVO-03"];
      if (isSvo04Complete) completedActivityIds.push("SVO-04");
      if (isSvo05Complete) completedActivityIds.push("SVO-05");
      persistCompletedActivities(completedActivityIds);
      window.setTimeout(() => {
        setIsSvo03Complete(true);
        returnToJourney();
      }, 1400);
    }
  }

  async function checkSentenceChallenge() {
    if (challengeAnswer.length !== activity4ExpectedUnits.length) {
      setActivity4Feedback("incomplete");
      return;
    }

    const interaction = createSubmitAnswerInteraction({
      sessionId: "svo-04-session",
      learnerId,
      submittedUnits: challengeAnswer.map((tile) => tile.label),
    });
    const evidence = evidenceEngine.capture(interaction);
    const assessment = assessmentEngine.assess({ evidence, expectedUnits: activity4ExpectedUnits });

    await progressEngine.recordAssessment({
      assessment,
      activityId: "SVO-04",
      skillId: "basic-svo-construction",
      timeSpentSeconds: 0,
    });

    setActivity4Feedback(assessment.correct ? "correct" : "incorrect");

    if (assessment.correct) {
      const completedActivityIds: ActivityId[] = ["SVO-01", "SVO-02", "SVO-03", "SVO-04"];
      if (isSvo05Complete) completedActivityIds.push("SVO-05");
      persistCompletedActivities(completedActivityIds);
      window.setTimeout(() => {
        setIsSvo04Complete(true);
        returnToJourney();
      }, 1400);
    }
  }

  async function checkMasterySentence() {
    const currentItem = masteryItems[masteryIndex];
    if (masteryAnswer.length !== currentItem.expectedUnits.length) {
      setActivity5Feedback("incomplete");
      return;
    }

    const interaction = createSubmitAnswerInteraction({
      sessionId: `svo-05-session-${masteryIndex + 1}`,
      learnerId,
      submittedUnits: masteryAnswer.map((tile) => tile.label),
    });
    const evidence = evidenceEngine.capture(interaction);
    const assessment = assessmentEngine.assess({ evidence, expectedUnits: currentItem.expectedUnits });

    await progressEngine.recordAssessment({
      assessment,
      activityId: "SVO-05",
      skillId: "basic-svo-construction",
      timeSpentSeconds: 0,
    });

    setActivity5Feedback(assessment.correct ? "correct" : "incorrect");

    if (!assessment.correct) return;

    const isFinalItem = masteryIndex === masteryItems.length - 1;
    if (isFinalItem) {
      persistCompletedActivities(["SVO-01", "SVO-02", "SVO-03", "SVO-04", "SVO-05"]);
      window.setTimeout(() => {
        setIsSvo05Complete(true);
        returnToJourney();
      }, 1400);
      return;
    }

    window.setTimeout(() => {
      resetActivity5(masteryIndex + 1);
    }, 1000);
  }

  const completedActivities = Number(isSvo01Complete) + Number(isSvo02Complete) + Number(isSvo03Complete) + Number(isSvo04Complete) + Number(isSvo05Complete);
  const currentMasteryItem = masteryItems[masteryIndex];
  const isFinalMasteryItem = masteryIndex === masteryItems.length - 1;

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={returnToJourney} aria-label="Go to SVO Journey">
          <span className="brand-mark">S11</span>
          <span>Spread11</span>
        </button>
        <div className="top-progress" aria-label={`Course progress: ${completedActivities} of 5 activities`}>
          <span className="progress-copy">SVO Journey</span>
          <span className="progress-track"><span style={{ width: `${completedActivities * 20}%` }} /></span>
          <span className="progress-count">{completedActivities} / 5</span>
        </div>
      </header>

      {screen === "journey" ? (
        <section className="journey-layout" aria-labelledby="journey-title">
          <div className="journey-heading">
            <div className="journey-title-block">
              <p className="eyebrow">Ogmiva English · Learning path</p>
              <h1 id="journey-title">Jornada <em>SVO</em></h1>
              <p>Da primeira estrutura ao domínio: avance por uma sequência cuidadosamente construída para transformar regra em confiança.</p>
              <div className="journey-signature" aria-label="Journey details">
                <span>05 etapas</span>
                <span>1 habilidade essencial</span>
                <span>Progresso local</span>
                <span>Listening experiment</span>
              </div>
            </div>
            <div className="journey-progress" aria-label={`${completedActivities} de 5 atividades concluídas`}>
              <div className="journey-progress-top">
                <span>Seu progresso</span>
                <span className="journey-progress-number">{completedActivities} / 5</span>
              </div>
              <strong>Basic SVO Construction</strong>
              <span className="journey-progress-track"><span style={{ width: `${completedActivities * 20}%` }} /></span>
              <small>{completedActivities} de 5 atividades concluídas</small>
            </div>
          </div>

          {isSvo01Complete && (
            <div className="unlock-notice" role="status">
              <span aria-hidden="true">✓</span>
              {isSvo05Complete ? (
                <div><strong>SVO-05 concluída!</strong><p>Você completou as 5 atividades da Jornada SVO.</p></div>
              ) : isSvo04Complete ? (
                <div><strong>SVO-04 concluída!</strong><p>O desafio de domínio foi desbloqueado.</p></div>
              ) : isSvo03Complete ? (
                isListening03Complete ? (
                  <div><strong>Listening 03 concluída!</strong><p>SVO-04 foi desbloqueada.</p></div>
                ) : (
                  <div><strong>SVO-03 concluída!</strong><p>Complete Listening 03 para desbloquear SVO-04.</p></div>
                )
              ) : isSvo02Complete ? (
                isListening02Complete ? (
                  <div><strong>Listening 02 concluída!</strong><p>SVO-03 foi desbloqueada.</p></div>
                ) : (
                  <div><strong>SVO-02 concluída!</strong><p>Complete Listening 02 para desbloquear SVO-03.</p></div>
                )
              ) : isListening01Complete ? (
                <div><strong>Listening 01 concluída!</strong><p>SVO-02 foi desbloqueada.</p></div>
              ) : (
                <div><strong>SVO-01 concluída!</strong><p>Complete Listening 01 para desbloquear SVO-02.</p></div>
              )}
            </div>
          )}

          <div className="journey-path">
            <section
              className="journey-stage journey-stage--pilot"
              data-stage-id="SVO-LISTENING-01"
              data-stage-progress={`${stage01CompletedCount}/2`}
              data-stage-state={stage01State}
              aria-labelledby="stage-01-heading"
            >
              <header className="paired-stage-header">
                <div>
                  <p className="paired-stage-kicker">Etapa 01</p>
                  <h2 id="stage-01-heading">Build, then listen</h2>
                  <p>Primeiro construa a sentença. Depois reconheça a mesma estrutura pela escuta.</p>
                </div>
                <div className="paired-stage-progress" aria-label={`${stage01CompletedCount} of 2 activities completed`}>
                  <strong>{stage01CompletedCount}/2</strong>
                  <span>concluídas</span>
                </div>
              </header>

              <article
                className={`journey-card paired-activity ${isSvo01Complete ? "is-complete" : "is-current"}`}
                data-activity-state={isSvo01Complete ? "complete" : "current"}
              >
                <div className="journey-step" aria-hidden="true">{isSvo01Complete ? "✓" : "01"}</div>
                <div className="journey-card-copy">
                  <div className="journey-card-meta">
                    <span>1A · SVO-01</span>
                    <span className={`status-chip ${isSvo01Complete ? "complete" : "available"}`}>
                      {isSvo01Complete ? "Concluída" : "Disponível"}
                    </span>
                  </div>
                  <h2 id="stage-01-title">Build the sentence</h2>
                  <p>Organize as palavras usando Subject + Verb + Object.</p>
                  <div className="journey-card-footer">
                    <span className="pattern-chip">S + V + O</span>
                    <button className="primary-button journey-button" type="button" onClick={openActivity1}>
                      {isSvo01Complete ? "Praticar novamente" : "Começar atividade"} <span>→</span>
                    </button>
                  </div>
                </div>
              </article>

              <div className="paired-stage-link" role="img" aria-label="SVO to Listening">
                <span>1A</span>
                <strong aria-hidden="true">→</strong>
                <span>1B</span>
              </div>

              <div
                className={`stage-listening paired-activity ${isListening01Complete ? "is-complete" : isListening01Unlocked ? "is-unlocked" : "is-locked"}`}
                data-activity-state={listening01State}
              >
                <div className="stage-listening-heading">
                  <div>
                    <p className="eyebrow">1B · Listening 01 · Audio-to-text recognition</p>
                    <h3>What did you hear?</h3>
                  </div>
                  <span className={`status-chip ${isListening01Complete ? "complete" : isListening01Unlocked ? "available" : "locked"}`}>
                    {isListening01Complete ? "Concluída" : isListening01Unlocked ? "Disponível" : "Bloqueada"}
                  </span>
                </div>

                {!isListening01Unlocked ? (
                  <div className="listening-locked" role="status">
                    <span aria-hidden="true">🔒</span>
                    <p>Complete SVO-01 to unlock Listening 01.</p>
                  </div>
                ) : (
                  <>
                    {!hasPlayedListeningPrompt && (
                      <p className="stage-guidance">SVO-01 concluída. Continue diretamente para a escuta.</p>
                    )}
                    <div className="listening-player">
                      <button
                        className="audio-button"
                        type="button"
                        onClick={playListeningPrompt}
                        disabled={isListeningPlaying}
                      >
                        <span aria-hidden="true">🔊</span>
                        {isListeningPlaying ? "Playing…" : hasPlayedListeningPrompt ? "Play again" : "Continue to Listening 01"}
                      </button>
                      <p>Listen first. The sentence is not shown as a transcript.</p>
                    </div>
                  </>
                )}

                {isListening01Unlocked && listeningAudioError && (
                  <div className="feedback incorrect" role="alert">
                    <span className="feedback-icon">!</span>
                    <div><strong>Audio could not play.</strong><p>Try the play button again in a browser with speech playback enabled.</p></div>
                  </div>
                )}

                {isListening01Unlocked && hasPlayedListeningPrompt && (
                  <div className="listening-question stage-listening-question">
                    <fieldset className="choice-section" disabled={listeningFeedback === "correct"}>
                      <legend className="section-label">Choose one answer</legend>
                      <div className="sentence-choices">
                        {sentenceChoices.map((choice, index) => (
                          <label
                            className={`sentence-choice ${selectedListeningChoice === choice.label ? "is-selected" : ""} ${listeningFeedback === "incorrect" && selectedListeningChoice === choice.label ? "is-incorrect" : ""}`}
                            key={`listening-${choice.id}`}
                          >
                            <input
                              type="radio"
                              name="listening-svo-choice"
                              value={choice.label}
                              checked={selectedListeningChoice === choice.label}
                              onChange={() => {
                                setSelectedListeningChoice(choice.label);
                                setListeningFeedback("idle");
                              }}
                            />
                            <span className="choice-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                            <span>{choice.label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {listeningFeedback === "incomplete" && (
                      <div className="feedback neutral" role="status">
                        <span className="feedback-icon">···</span>
                        <div><strong>Choose an answer.</strong><p>Select the sentence you heard before checking.</p></div>
                      </div>
                    )}

                    {listeningFeedback === "incorrect" && (
                      <div className="feedback incorrect" role="alert">
                        <span className="feedback-icon">↺</span>
                        <div><strong>Not quite — listen again.</strong><p>Listen carefully, then compare what you heard with each written option.</p></div>
                      </div>
                    )}

                    {listeningFeedback === "correct" && (
                      <div className="feedback correct" role="status">
                        <span className="feedback-icon">✓</span>
                        <div><strong>Great listening!</strong><p>You correctly identified the sentence you heard.</p></div>
                      </div>
                    )}

                    <div className="activity-actions listening-actions">
                      {listeningFeedback === "correct" ? (
                        <div className="stage-complete-actions">
                          <button className="secondary-button" type="button" onClick={resetListeningExperiment}>Try again</button>
                          <button className="primary-button" type="button" onClick={openActivity2}>Continue to SVO-02 <span>→</span></button>
                        </div>
                      ) : (
                        <button className="primary-button" type="button" onClick={checkListeningChoice}>Check answer <span>→</span></button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div className={`path-connector ${isSvo02Unlocked ? "is-unlocked" : ""}`} aria-hidden="true"><span /></div>

            <section
              className="journey-stage journey-stage--pilot"
              data-stage-id="SVO-LISTENING-02"
              data-stage-progress={`${stage02CompletedCount}/2`}
              data-stage-state={stage02State}
              aria-labelledby="stage-02-heading"
            >
              <header className="paired-stage-header">
                <div>
                  <p className="paired-stage-kicker">Etapa 02</p>
                  <h2 id="stage-02-heading">Choose, then rebuild</h2>
                  <p>Primeiro reconheça a sentença correta. Depois reconstrua pela escuta.</p>
                </div>
                <div className="paired-stage-progress" aria-label={`${stage02CompletedCount} of 2 activities completed`}>
                  <strong>{stage02CompletedCount}/2</strong>
                  <span>concluídas</span>
                </div>
              </header>

              <article
                className={`journey-card paired-activity ${isSvo02Complete ? "is-complete" : isSvo02Unlocked ? "is-unlocked" : "is-locked"}`}
                data-activity-state={svo02State}
              >
                <div className="journey-step" aria-hidden="true">{isSvo02Complete ? "✓" : "02"}</div>
                <div className="journey-card-copy">
                  <div className="journey-card-meta">
                    <span>2A · SVO-02</span>
                    <span className={`status-chip ${isSvo02Complete ? "complete" : isSvo02Unlocked ? "available" : "locked"}`}>
                      {isSvo02Complete ? "Concluída" : isSvo02Unlocked ? "Desbloqueada" : "Bloqueada"}
                    </span>
                  </div>
                  <h2 id="stage-02-title">Choose the correct sentence</h2>
                  <p>{isSvo02Unlocked
                    ? "Reconheça qual alternativa segue a ordem Subject + Verb + Object."
                    : isSvo01Complete
                      ? "Conclua Listening 01 para liberar esta atividade."
                      : "Conclua SVO-01 para liberar esta atividade."}</p>
                  <div className="journey-card-footer">
                    <span className="pattern-chip">Reconhecimento</span>
                    {isSvo02Unlocked ? (
                      <button className="primary-button journey-button" type="button" onClick={openActivity2}>
                        {isSvo02Complete ? "Praticar novamente" : "Começar atividade"} <span>→</span>
                      </button>
                    ) : (
                      <span className="coming-soon">🔒</span>
                    )}
                  </div>
                </div>
              </article>

              <div className="paired-stage-link" role="img" aria-label="SVO to Listening">
                <span>2A</span>
                <strong aria-hidden="true">→</strong>
                <span>2B</span>
              </div>

              <div
                className={`stage-listening paired-activity ${isListening02Complete ? "is-complete" : isListening02Unlocked ? "is-unlocked" : "is-locked"}`}
                data-activity-state={listening02State}
                aria-labelledby="listening-02-title"
              >
                <div className="stage-listening-heading">
                  <div>
                    <p className="eyebrow">2B · Listening 02 · Audio-to-sentence reconstruction</p>
                    <h3 id="listening-02-title">Rebuild the sentence you hear</h3>
                  </div>
                  <span className={`status-chip ${isListening02Complete ? "complete" : isListening02Unlocked ? "available" : "locked"}`}>
                    {isListening02Complete ? "Concluída" : isListening02Unlocked ? "Disponível" : "Bloqueada"}
                  </span>
                </div>

                {!isListening02Unlocked ? (
                  <div className="listening-locked" role="status">
                    <span aria-hidden="true">🔒</span>
                    <p>Complete SVO-02 to unlock this activity.</p>
                  </div>
                ) : (
                  <>
                    {!hasPlayedListening02Prompt && (
                      <p className="stage-guidance">SVO-02 concluída. Continue diretamente para a escuta.</p>
                    )}
                    <div className="listening-player">
                      <button className="audio-button" type="button" onClick={playListening02Prompt} disabled={isListening02Playing}>
                        <span aria-hidden="true">🔊</span>
                        {isListening02Playing ? "Playing…" : hasPlayedListening02Prompt ? "Play again" : "Continue to Listening 02"}
                      </button>
                      <p>Listen first. The sentence is not shown as a transcript.</p>
                    </div>

                    {listening02AudioError && (
                      <div className="feedback incorrect" role="alert">
                        <span className="feedback-icon">!</span>
                        <div><strong>Audio could not play.</strong><p>Try the play button again in a browser with speech playback enabled.</p></div>
                      </div>
                    )}

                    {hasPlayedListening02Prompt && (
                      <>
                        <div className="answer-section">
                          <div className="section-label">
                            <span>Your reconstruction</span>
                            {listening02Answer.length > 0 && listening02Feedback !== "correct" && (
                              <button className="text-button" type="button" onClick={() => {
                                setListening02Available(listening02InitialTiles);
                                setListening02Answer([]);
                                setListening02Feedback("idle");
                              }}>Clear</button>
                            )}
                          </div>
                          <div
                            className={`answer-zone ${listening02Feedback === "incorrect" ? "is-incorrect" : ""} ${listening02Feedback === "correct" ? "is-correct" : ""}`}
                            aria-live="polite"
                          >
                            {listening02Answer.length === 0 ? (
                              <p className="placeholder">Choose the words in the order you heard them</p>
                            ) : (
                              listening02Answer.map((tile, index) => (
                                <button
                                  className="word-tile selected"
                                  type="button"
                                  key={tile.id}
                                  onClick={() => returnToListening02Bank(tile)}
                                  aria-label={`Remove ${tile.label} from position ${index + 1}`}
                                  disabled={listening02Feedback === "correct"}
                                >
                                  <span className="tile-order">{index + 1}</span>
                                  {tile.label}
                                </button>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="word-bank-section">
                          <span className="section-label">Words you heard</span>
                          <div className="word-bank">
                            {listening02Available.length === 0 ? (
                              <p className="bank-empty">All words are in your reconstruction.</p>
                            ) : (
                              listening02Available.map((tile) => (
                                <button
                                  className="word-tile"
                                  type="button"
                                  key={tile.id}
                                  onClick={() => addToListening02Answer(tile)}
                                >
                                  {tile.label}
                                </button>
                              ))
                            )}
                          </div>
                        </div>

                        {listening02Feedback === "incomplete" && (
                          <div className="feedback neutral" role="status">
                            <span className="feedback-icon">···</span>
                            <div><strong>Keep going.</strong><p>Use every word before checking your reconstruction.</p></div>
                          </div>
                        )}

                        {listening02Feedback === "incorrect" && (
                          <div className="feedback incorrect" role="alert">
                            <span className="feedback-icon">↺</span>
                            <div><strong>Not quite — listen again.</strong><p>The words are present, but their order does not match the sentence you heard.</p></div>
                          </div>
                        )}

                        {listening02Feedback === "correct" && (
                          <div className="feedback correct" role="status">
                            <span className="feedback-icon">✓</span>
                            <div><strong>Great listening!</strong><p>You rebuilt the sentence you heard in the expected order.</p></div>
                          </div>
                        )}

                        <div className="activity-actions listening-actions">
                          {listening02Feedback === "correct" ? (
                            <div className="stage-complete-actions">
                              <button className="secondary-button" type="button" onClick={resetListening02}>Try again</button>
                              <button className="primary-button" type="button" onClick={openActivity3}>Continue to SVO-03 <span>→</span></button>
                            </div>
                          ) : (
                            <button className="primary-button" type="button" onClick={handleListening02Answer}>Check reconstruction <span>→</span></button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </section>

            <div className={`path-connector ${isSvo03Unlocked ? "is-unlocked" : ""}`} aria-hidden="true"><span /></div>

            <section
              className="journey-stage journey-stage--pilot"
              data-stage-id="SVO-LISTENING-03"
              data-stage-progress={`${stage03CompletedCount}/2`}
              data-stage-state={stage03State}
              aria-labelledby="stage-03-heading"
            >
              <header className="paired-stage-header">
                <div>
                  <p className="paired-stage-kicker">Etapa 03</p>
                  <h2 id="stage-03-heading">Complete, then choose</h2>
                  <p>Primeiro complete a estrutura. Depois escolha e ordene o que ouviu entre distratores.</p>
                </div>
                <div className="paired-stage-progress" aria-label={`${stage03CompletedCount} of 2 activities completed`}>
                  <strong>{stage03CompletedCount}/2</strong>
                  <span>concluídas</span>
                </div>
              </header>

              <article
                className={`journey-card paired-activity ${isSvo03Complete ? "is-complete" : isSvo03Unlocked ? "is-unlocked" : "is-locked"}`}
                data-activity-state={svo03State}
              >
                <div className="journey-step" aria-hidden="true">{isSvo03Complete ? "✓" : "03"}</div>
                <div className="journey-card-copy">
                  <div className="journey-card-meta">
                    <span>3A · SVO-03</span>
                    <span className={`status-chip ${isSvo03Complete ? "complete" : isSvo03Unlocked ? "available" : "locked"}`}>
                      {isSvo03Complete ? "Concluída" : isSvo03Unlocked ? "Desbloqueada" : "Bloqueada"}
                    </span>
                  </div>
                  <h2 id="stage-03-title">Complete the sentence</h2>
                  <p>{isSvo03Unlocked
                    ? "Escolha o elemento que completa a estrutura Subject + Verb + Object."
                    : isSvo02Complete
                      ? "Conclua Listening 02 para liberar esta atividade."
                      : "Conclua SVO-02 para liberar esta atividade."}</p>
                  <div className="journey-card-footer">
                    <span className="pattern-chip">Completar</span>
                    {isSvo03Unlocked ? (
                      <button className="primary-button journey-button" type="button" onClick={openActivity3}>
                        {isSvo03Complete ? "Praticar novamente" : "Começar atividade"} <span>→</span>
                      </button>
                    ) : (
                      <span className="coming-soon">🔒</span>
                    )}
                  </div>
                </div>
              </article>

              <div className="paired-stage-link" role="img" aria-label="SVO to Listening">
                <span>3A</span>
                <strong aria-hidden="true">→</strong>
                <span>3B</span>
              </div>

              <div
                className={`stage-listening paired-activity ${isListening03Complete ? "is-complete" : isListening03Unlocked ? "is-unlocked" : "is-locked"}`}
                data-activity-state={listening03State}
                aria-labelledby="listening-03-title"
              >
                <div className="stage-listening-heading">
                  <div>
                    <p className="eyebrow">3B · Listening 03 · Reconstruction with distractors</p>
                    <h3 id="listening-03-title">Choose and rebuild what you hear</h3>
                  </div>
                  <span className={`status-chip ${isListening03Complete ? "complete" : isListening03Unlocked ? "available" : "locked"}`}>
                    {isListening03Complete ? "Concluída" : isListening03Unlocked ? "Disponível" : "Bloqueada"}
                  </span>
                </div>

                {!isListening03Unlocked ? (
                  <div className="listening-locked" role="status">
                    <span aria-hidden="true">🔒</span>
                    <p>Complete SVO-03 to unlock this activity.</p>
                  </div>
                ) : (
                  <>
                    {!hasPlayedListening03Prompt && (
                      <p className="stage-guidance">SVO-03 concluída. Continue diretamente para a escuta.</p>
                    )}
                    <div className="listening-player">
                      <button className="audio-button" type="button" onClick={playListening03Prompt} disabled={isListening03Playing}>
                        <span aria-hidden="true">🔊</span>
                        {isListening03Playing ? "Playing…" : hasPlayedListening03Prompt ? "Play again" : "Continue to Listening 03"}
                      </button>
                      <p>Listen first. Two tiles do not belong to the sentence.</p>
                    </div>

                    {listening03AudioError && (
                      <div className="feedback incorrect" role="alert">
                        <span className="feedback-icon">!</span>
                        <div><strong>Audio could not play.</strong><p>Try the play button again in a browser with speech playback enabled.</p></div>
                      </div>
                    )}

                    {hasPlayedListening03Prompt && (
                      <>
                        <div className="answer-section">
                          <div className="section-label">
                            <span>Your reconstruction</span>
                            {listening03Answer.length > 0 && listening03Feedback !== "correct" && (
                              <button className="text-button" type="button" onClick={() => {
                                setListening03Available(listening03InitialTiles);
                                setListening03Answer([]);
                                setListening03Feedback("idle");
                              }}>Clear</button>
                            )}
                          </div>
                          <div
                            className={`answer-zone ${listening03Feedback === "incorrect" ? "is-incorrect" : ""} ${listening03Feedback === "correct" ? "is-correct" : ""}`}
                            aria-live="polite"
                          >
                            {listening03Answer.length === 0 ? (
                              <p className="placeholder">Choose three words in the order you heard them</p>
                            ) : (
                              listening03Answer.map((tile, index) => (
                                <button
                                  className="word-tile selected"
                                  type="button"
                                  key={tile.id}
                                  onClick={() => returnToListening03Bank(tile)}
                                  aria-label={`Remove ${tile.label} from position ${index + 1}`}
                                  disabled={listening03Feedback === "correct"}
                                >
                                  <span className="tile-order">{index + 1}</span>
                                  {tile.label}
                                </button>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="word-bank-section">
                          <span className="section-label">Word bank</span>
                          <div className="word-bank">
                            {listening03Available.map((tile) => (
                              <button
                                className="word-tile"
                                type="button"
                                key={tile.id}
                                onClick={() => addToListening03Answer(tile)}
                                disabled={listening03Answer.length >= listening03Activity.expectedUnits.length}
                              >
                                {tile.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {listening03Feedback === "incomplete" && (
                          <div className="feedback neutral" role="status">
                            <span className="feedback-icon">···</span>
                            <div><strong>Choose three words.</strong><p>Leave the distractors in the bank.</p></div>
                          </div>
                        )}

                        {listening03Feedback === "incorrect" && (
                          <div className="feedback incorrect" role="alert">
                            <span className="feedback-icon">↺</span>
                            <div><strong>Not quite — listen again.</strong><p>One or more selected words, or their order, does not match what you heard.</p></div>
                          </div>
                        )}

                        {listening03Feedback === "correct" && (
                          <div className="feedback correct" role="status">
                            <span className="feedback-icon">✓</span>
                            <div><strong>Great listening!</strong><p>You selected the words you heard and rebuilt the sentence in the expected order.</p></div>
                          </div>
                        )}

                        <div className="activity-actions listening-actions">
                          {listening03Feedback === "correct" ? (
                            <div className="stage-complete-actions">
                              <button className="secondary-button" type="button" onClick={resetListening03}>Try again</button>
                              <button className="primary-button" type="button" onClick={openActivity4}>Continue to SVO-04 <span>→</span></button>
                            </div>
                          ) : (
                            <button className="primary-button" type="button" onClick={handleListening03Answer}>Check reconstruction <span>→</span></button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </section>

            <div className={`path-connector ${isSvo04Unlocked ? "is-unlocked" : ""}`} aria-hidden="true"><span /></div>

            <section
              className="journey-stage journey-stage--pilot"
              data-stage-id="SVO-LISTENING-04"
              data-stage-progress={`${stage04CompletedCount}/2`}
              data-stage-state={stage04State}
              aria-labelledby="stage-04-heading"
            >
              <header className="paired-stage-header">
                <div>
                  <p className="paired-stage-kicker">Etapa 04</p>
                  <h2 id="stage-04-heading">Challenge, then map</h2>
                  <p>Primeiro enfrente os distratores. Depois associe o que ouviu aos papéis de SVO.</p>
                </div>
                <div className="paired-stage-progress" aria-label={`${stage04CompletedCount} of 2 activities completed`}>
                  <strong>{stage04CompletedCount}/2</strong>
                  <span>concluídas</span>
                </div>
              </header>

              <article
                className={`journey-card paired-activity ${isSvo04Complete ? "is-complete" : isSvo04Unlocked ? "is-unlocked" : "is-locked"}`}
                data-activity-state={svo04State}
              >
                <div className="journey-step" aria-hidden="true">{isSvo04Complete ? "✓" : "04"}</div>
                <div className="journey-card-copy">
                  <div className="journey-card-meta">
                    <span>4A · SVO-04</span>
                    <span className={`status-chip ${isSvo04Complete ? "complete" : isSvo04Unlocked ? "available" : "locked"}`}>
                      {isSvo04Complete ? "Concluída" : isSvo04Unlocked ? "Desbloqueada" : "Bloqueada"}
                    </span>
                  </div>
                  <h2 id="stage-04-title">Sentence challenge</h2>
                  <p>{isSvo04Unlocked
                    ? "Construa a frase escolhendo a estrutura correta entre palavras distratoras."
                    : isSvo03Complete
                      ? "Conclua Listening 03 para liberar esta atividade."
                      : "Conclua SVO-03 para liberar esta atividade."}</p>
                  <div className="journey-card-footer">
                    <span className="pattern-chip">Desafio</span>
                    {isSvo04Unlocked ? (
                      <button className="primary-button journey-button" type="button" onClick={openActivity4}>
                        {isSvo04Complete ? "Praticar novamente" : "Começar atividade"} <span>→</span>
                      </button>
                    ) : (
                      <span className="coming-soon">🔒</span>
                    )}
                  </div>
                </div>
              </article>

              <div className="paired-stage-link" role="img" aria-label="SVO to Listening">
                <span>4A</span>
                <strong aria-hidden="true">→</strong>
                <span>4B</span>
              </div>

              <div
                className={`stage-listening paired-activity ${isListening04Complete ? "is-complete" : isListening04Unlocked ? "is-unlocked" : "is-locked"}`}
                data-activity-state={listening04State}
                aria-labelledby="listening-04-title"
              >
                <div className="stage-listening-heading">
                  <div>
                    <p className="eyebrow">4B · Listening 04 · Audio-to-SVO role mapping</p>
                    <h3 id="listening-04-title">Match the words you hear to their roles</h3>
                  </div>
                  <span className={`status-chip ${isListening04Complete ? "complete" : isListening04Unlocked ? "available" : "locked"}`}>
                    {isListening04Complete ? "Concluída" : isListening04Unlocked ? "Disponível" : "Bloqueada"}
                  </span>
                </div>

                {!isListening04Unlocked ? (
                  <div className="listening-locked" role="status">
                    <span aria-hidden="true">🔒</span>
                    <p>Complete SVO-04 to unlock this activity.</p>
                  </div>
                ) : (
                  <>
                    {!hasPlayedListening04Prompt && (
                      <p className="stage-guidance">SVO-04 concluída. Continue diretamente para a escuta.</p>
                    )}
                    <div className="listening-player">
                      <button className="audio-button" type="button" onClick={playListening04Prompt} disabled={isListening04Playing}>
                        <span aria-hidden="true">🔊</span>
                        {isListening04Playing ? "Playing…" : hasPlayedListening04Prompt ? "Play again" : "Continue to Listening 04"}
                      </button>
                      <p>Listen first. Select a role slot, then choose a word. Two tiles are distractors.</p>
                    </div>

                    {listening04AudioError && (
                      <div className="feedback incorrect" role="alert">
                        <span className="feedback-icon">!</span>
                        <div><strong>Audio could not play.</strong><p>Try the play button again in a browser with speech playback enabled.</p></div>
                      </div>
                    )}

                    {hasPlayedListening04Prompt && (
                      <>
                        <div className="answer-section">
                          <span className="section-label">Role slots</span>
                          <div className="listening-role-slots" aria-label="Sentence role slots">
                            {listening04VisualRoles.map((role) => {
                              const tile = listening04Slots[role];
                              const isActive = listening04ActiveRole === role;

                              return (
                                <button
                                  className={`listening-role-slot ${isActive ? "is-active" : ""} ${listening04Feedback === "incorrect" ? "is-incorrect" : ""} ${listening04Feedback === "correct" ? "is-correct" : ""}`}
                                  type="button"
                                  key={role}
                                  onClick={() => tile ? removeListening04Tile(role) : setListening04ActiveRole(role)}
                                  aria-pressed={isActive}
                                  aria-label={tile ? `Remove ${tile.label} from ${role}` : `Select ${role} slot`}
                                  disabled={listening04Feedback === "correct"}
                                >
                                  <span className="listening-role-label">{role}</span>
                                  <strong>{tile?.label ?? "Choose a word"}</strong>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="word-bank-section">
                          <span className="section-label">Word bank</span>
                          <div className="word-bank">
                            {listening04Available.map((tile) => (
                              <button
                                className="word-tile"
                                type="button"
                                key={tile.id}
                                onClick={() => assignListening04Tile(tile)}
                                disabled={listening04Feedback === "correct"}
                              >
                                {tile.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {listening04Feedback === "incorrect" && (
                          <div className="feedback incorrect" role="alert">
                            <span className="feedback-icon">↺</span>
                            <div><strong>Not quite — listen again.</strong><p>One or more words does not match the role you selected. Listen again.</p></div>
                          </div>
                        )}

                        {listening04Feedback === "correct" && (
                          <div className="feedback correct" role="status">
                            <span className="feedback-icon">✓</span>
                            <div><strong>Great listening!</strong><p>You matched the words you heard to Subject, Verb, and Object.</p></div>
                          </div>
                        )}

                        <div className="activity-actions listening-actions">
                          {listening04Feedback === "correct" ? (
                            <div className="stage-complete-actions">
                              <button className="secondary-button" type="button" onClick={resetListening04}>Try again</button>
                              <button className="primary-button" type="button" onClick={openActivity5}>Continue to SVO-05 <span>→</span></button>
                            </div>
                          ) : (
                            <button
                              className="primary-button"
                              type="button"
                              onClick={handleListening04Answer}
                              disabled={!isListening04Unlocked || !listening04Slots.Subject || !listening04Slots.Verb || !listening04Slots.Object}
                            >
                              Check roles <span>→</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </section>

            <div className={`path-connector ${isSvo05Unlocked ? "is-unlocked" : ""}`} aria-hidden="true"><span /></div>

            <section
              className="journey-stage journey-stage--pilot"
              data-stage-id="SVO-LISTENING-05"
              data-stage-progress={`${stage05CompletedCount}/2`}
              data-stage-state={stage05State}
              aria-labelledby="stage-05-heading"
            >
              <header className="paired-stage-header">
                <div>
                  <p className="paired-stage-kicker">Etapa 05</p>
                  <h2 id="stage-05-heading">Master, then transfer</h2>
                  <p>Primeiro demonstre domínio. Depois transfira o mapeamento auditivo para uma nova sentença.</p>
                </div>
                <div className="paired-stage-progress" aria-label={`${stage05CompletedCount} of 2 activities completed`}>
                  <strong>{stage05CompletedCount}/2</strong>
                  <span>concluídas</span>
                </div>
              </header>

              <article
                className={`journey-card paired-activity ${isSvo05Complete ? "is-complete" : isSvo05Unlocked ? "is-unlocked" : "is-locked"}`}
                data-activity-state={svo05State}
              >
                <div className="journey-step" aria-hidden="true">{isSvo05Complete ? "✓" : "05"}</div>
                <div className="journey-card-copy">
                  <div className="journey-card-meta">
                    <span>5A · SVO-05</span>
                    <span className={`status-chip ${isSvo05Complete ? "complete" : isSvo05Unlocked ? "available" : "locked"}`}>
                      {isSvo05Complete ? "Concluída" : isSvo05Unlocked ? "Desbloqueada" : "Bloqueada"}
                    </span>
                  </div>
                  <h2 id="stage-05-title">Mastery challenge</h2>
                  <p>{isSvo05Unlocked
                    ? "Resolva três sentenças sem dicas de estrutura para demonstrar domínio."
                    : isSvo04Complete
                      ? "Conclua Listening 04 para liberar esta atividade."
                      : "Conclua SVO-04 para liberar esta atividade."}</p>
                  <div className="journey-card-footer">
                    <span className="pattern-chip">Domínio</span>
                    {isSvo05Unlocked ? (
                      <button className="primary-button journey-button" type="button" onClick={openActivity5}>
                        {isSvo05Complete ? "Praticar novamente" : "Começar atividade"} <span>→</span>
                      </button>
                    ) : (
                      <span className="coming-soon">🔒</span>
                    )}
                  </div>
                </div>
              </article>

              <div className="paired-stage-link" role="img" aria-label="SVO to Listening">
                <span>5A</span>
                <strong aria-hidden="true">→</strong>
                <span>5B</span>
              </div>

              <div
                className={`stage-listening paired-activity ${isListening05Complete ? "is-complete" : isListening05Unlocked ? "is-unlocked" : "is-locked"}`}
                data-activity-state={listening05State}
                aria-labelledby="listening-05-title"
                data-activity-id={listening05Activity.id}
              >
                <div className="stage-listening-heading">
                  <div>
                    <p className="eyebrow">5B · Listening 05 · SVO role-mapping transfer</p>
                    <h3 id="listening-05-title">Apply the role mapping to a new sentence</h3>
                  </div>
                  <span className={`status-chip ${isListening05Complete ? "complete" : isListening05Unlocked ? "available" : "locked"}`}>
                    {isListening05Complete ? "Concluída" : isListening05Unlocked ? "Disponível" : "Bloqueada"}
                  </span>
                </div>

              {!isListening05Unlocked && (
                <div className="listening-locked" role="status">
                  <span aria-hidden="true">🔒</span>
                  <p>Complete SVO-05 to unlock this activity.</p>
                </div>
              )}

              <div
                className="listening-player"
                hidden={!isListening05Unlocked}
                aria-hidden={!isListening05Unlocked}
              >
                <button
                  className="audio-button"
                  type="button"
                  aria-label="Play Listening 05 audio"
                  onClick={playListening05Prompt}
                  disabled={!isListening05Unlocked || isListening05Playing}
                >
                  <span aria-hidden="true">🔊</span>
                  {isListening05Playing
                    ? "Playing…"
                    : hasPlayedListening05Prompt
                      ? "Play again"
                      : isListening05Unlocked
                        ? "Continue to Listening 05"
                        : "Play audio"}
                </button>
                <p>Listen first. The sentence is not shown as a transcript.</p>
              </div>

              <div
                hidden={!isListening05Unlocked || !hasPlayedListening05Prompt}
                aria-hidden={!isListening05Unlocked || !hasPlayedListening05Prompt}
              >
                <div className="answer-section">
                  <span className="section-label">Role slots</span>
                  <div className="listening-role-slots" aria-label="Listening 05 role slots">
                    {listening05VisualRoles.map((role) => {
                      const tile = listening05Slots[role];
                      const isActive = listening05ActiveRole === role;

                      return (
                        <button
                          className={`listening-role-slot ${isActive ? "is-active" : ""} ${listening05Feedback === "incorrect" ? "is-incorrect" : ""} ${listening05Feedback === "correct" ? "is-correct" : ""}`}
                          type="button"
                          key={role}
                          onClick={() => tile ? removeListening05Tile(role) : setListening05ActiveRole(role)}
                          aria-pressed={isActive}
                          aria-label={tile ? `Remove ${tile.label} from ${role}` : `Select ${role} slot`}
                          disabled={
                            !isListening05Unlocked
                            || !hasPlayedListening05Prompt
                            || listening05Feedback === "correct"
                          }
                        >
                          <span className="listening-role-label">{role}</span>
                          <strong>{tile?.label ?? "Choose a word"}</strong>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="word-bank-section">
                  <span className="section-label">Word bank</span>
                  <div className="word-bank">
                    {listening05Available.map((tile) => (
                      <button
                        className="word-tile"
                        type="button"
                        key={tile.id}
                        onClick={() => assignListening05Tile(tile)}
                        disabled={
                          !isListening05Unlocked
                          || !hasPlayedListening05Prompt
                          || listening05Feedback === "correct"
                        }
                      >
                        {tile.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="activity-actions listening-actions">
                  {listening05Feedback === "correct" ? (
                    <button
                      className="primary-button"
                      type="button"
                      aria-label="Try Listening 05 again"
                      onClick={resetListening05}
                    >
                      Try again
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      type="button"
                      aria-label="Submit Listening 05 role mapping"
                      onClick={handleListening05Answer}
                      disabled={
                        !isListening05Unlocked
                        || !listening05Slots.Subject
                        || !listening05Slots.Verb
                        || !listening05Slots.Object
                      }
                    >
                      Check roles <span>→</span>
                    </button>
                  )}
                </div>

                <div aria-label="Listening 05 feedback" aria-live="polite">
                  {listening05Feedback === "incorrect" && (
                    <div className="feedback incorrect" role="alert">
                      <span className="feedback-icon">↺</span>
                      <div>
                        <strong>Not quite — listen again.</strong>
                        <p>One or more words does not match the role you selected. Listen again.</p>
                      </div>
                    </div>
                  )}

                  {listening05Feedback === "correct" && (
                    <div className="feedback correct" role="status">
                      <span className="feedback-icon">✓</span>
                      <div>
                        <strong>Jornada concluída!</strong>
                        <p>You matched the words from a new sentence to Subject, Verb, and Object and completed the current journey.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </div>
            </section>
          </div>
        </section>
      ) : (
      <section className={`lesson-layout ${screen === "activity-5" ? "mastery-layout" : ""}`}>
        {screen !== "activity-5" && (
        <aside className="lesson-rail" aria-label="Lesson information">
          <p className="eyebrow">Skill</p>
          <h2>Basic SVO construction</h2>
          <div className="rule-card">
            <span className="rule-label">Sentence pattern</span>
            <div className="rule-formula" aria-label="Subject plus Verb plus Object">
              <span>S</span><b>+</b><span>V</span><b>+</b><span>O</span>
            </div>
            <p>Subject + Verb + Object</p>
          </div>
          <div className="rail-note">
            <span aria-hidden="true">✦</span>
            <p><strong>Tip</strong> Find who performs the action first.</p>
          </div>
        </aside>
        )}

        {screen === "activity-1" ? (
        <section className="activity-card" aria-labelledby="activity-title">
          <div className="activity-heading">
            <div>
              <button className="back-button" type="button" onClick={returnToJourney}>← Jornada SVO</button>
              <p className="eyebrow">Activity 1 · SVO-01</p>
              <h1 id="activity-title">Build the sentence</h1>
              <p className="instruction">Organize the words into a correct English sentence.</p>
            </div>
            <span className="xp-chip">+20 XP</span>
          </div>

          <div className="answer-section">
            <div className="section-label">
              <span>Your sentence</span>
              {answer.length > 0 && feedback !== "correct" && (
                <button className="text-button" type="button" onClick={resetActivity}>Clear</button>
              )}
            </div>
            <div
              className={`answer-zone ${feedback === "incorrect" ? "is-incorrect" : ""} ${feedback === "correct" ? "is-correct" : ""}`}
              aria-live="polite"
            >
              {answer.length === 0 ? (
                <p className="placeholder">Choose the words below to begin</p>
              ) : (
                answer.map((tile, index) => (
                  <button
                    className="word-tile selected"
                    type="button"
                    key={tile.id}
                    onClick={() => returnToBank(tile)}
                    aria-label={`Remove ${tile.label} from position ${index + 1}`}
                    disabled={feedback === "correct"}
                  >
                    <span className="tile-order">{index + 1}</span>
                    {tile.label}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="word-bank-section">
            <span className="section-label">Word bank</span>
            <div className="word-bank">
              {available.length === 0 ? (
                <p className="bank-empty">All words are in your sentence.</p>
              ) : (
                available.map((tile) => (
                  <button
                    className="word-tile"
                    type="button"
                    key={tile.id}
                    onClick={() => addToAnswer(tile)}
                  >
                    {tile.label}
                  </button>
                ))
              )}
            </div>
          </div>

          {feedback === "incomplete" && (
            <div className="feedback neutral" role="status">
              <span className="feedback-icon">···</span>
              <div><strong>Keep going.</strong><p>Use every word before checking your sentence.</p></div>
            </div>
          )}

          {feedback === "incorrect" && (
            <div className="feedback incorrect" role="alert">
              <span className="feedback-icon">↺</span>
              <div>
                <strong>Not quite — let’s rebuild it.</strong>
                <p>Who performs the action? Start with the subject, then add the verb and object.</p>
                <div className="mini-rule"><span>Subject</span><b>+</b><span>Verb</span><b>+</b><span>Object</span></div>
              </div>
            </div>
          )}

          {feedback === "correct" && (
            <div className="feedback correct" role="status">
              <span className="feedback-icon">✓</span>
              <div>
                <strong>Great work!</strong>
                <p><em>{sentence}.</em> follows Subject + Verb + Object.</p>
              </div>
              <span className="earned">+20 XP</span>
            </div>
          )}

          <div className="activity-actions">
            {feedback === "correct" ? (
              <button className="primary-button" type="button" disabled>Returning to journey…</button>
            ) : (
              <button className="primary-button" type="button" onClick={checkSentence}>Check sentence <span>→</span></button>
            )}
          </div>
        </section>
        ) : screen === "activity-2" ? (
        <section className="activity-card" aria-labelledby="activity-2-title">
          <div className="activity-heading">
            <div>
              <button className="back-button" type="button" onClick={returnToJourney}>← Jornada SVO</button>
              <p className="eyebrow">Activity 2 · SVO-02</p>
              <h1 id="activity-2-title">Choose the correct sentence</h1>
              <p className="instruction">Select the sentence that follows Subject + Verb + Object.</p>
            </div>
            <span className="xp-chip">+20 XP</span>
          </div>

          <fieldset className="choice-section" disabled={activity2Feedback === "correct"}>
            <legend className="section-label">Choose one answer</legend>
            <div className="sentence-choices">
              {sentenceChoices.map((choice, index) => (
                <label
                  className={`sentence-choice ${selectedChoice === choice.label ? "is-selected" : ""} ${activity2Feedback === "incorrect" && selectedChoice === choice.label ? "is-incorrect" : ""}`}
                  key={choice.id}
                >
                  <input
                    type="radio"
                    name="svo-02-choice"
                    value={choice.label}
                    checked={selectedChoice === choice.label}
                    onChange={() => {
                      setSelectedChoice(choice.label);
                      setActivity2Feedback("idle");
                    }}
                  />
                  <span className="choice-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {activity2Feedback === "incomplete" && (
            <div className="feedback neutral" role="status">
              <span className="feedback-icon">···</span>
              <div><strong>Choose an answer.</strong><p>Select one sentence before checking.</p></div>
            </div>
          )}

          {activity2Feedback === "incorrect" && (
            <div className="feedback incorrect" role="alert">
              <span className="feedback-icon">↺</span>
              <div>
                <strong>Not quite — try again.</strong>
                <p>Remember the order: who performs the action, then the action, then what receives it.</p>
                <div className="mini-rule"><span>Subject</span><b>+</b><span>Verb</span><b>+</b><span>Object</span></div>
              </div>
            </div>
          )}

          {activity2Feedback === "correct" && (
            <div className="feedback correct" role="status">
              <span className="feedback-icon">✓</span>
              <div>
                <strong>Great choice!</strong>
                <p><em>Anna likes music.</em> follows Subject + Verb + Object.</p>
              </div>
              <span className="earned">+20 XP</span>
            </div>
          )}

          <div className="activity-actions">
            {activity2Feedback === "correct" ? (
              <button className="primary-button" type="button" disabled>Returning to journey…</button>
            ) : (
              <button className="primary-button" type="button" onClick={checkSentenceChoice}>Check answer <span>→</span></button>
            )}
          </div>
        </section>
        ) : screen === "activity-3" ? (
        <section className="activity-card" aria-labelledby="activity-3-title">
          <div className="activity-heading">
            <div>
              <button className="back-button" type="button" onClick={returnToJourney}>← Jornada SVO</button>
              <p className="eyebrow">Activity 3 · SVO-03</p>
              <h1 id="activity-3-title">Complete the sentence</h1>
              <p className="instruction">Choose the word that completes the Subject + Verb + Object pattern.</p>
            </div>
            <span className="xp-chip">+20 XP</span>
          </div>

          <div className="completion-prompt" aria-label="Daniel reads blank">
            <span>Daniel</span> <span>reads</span> <span className="sentence-blank">______</span><span>.</span>
          </div>

          <fieldset className="choice-section" disabled={activity3Feedback === "correct"}>
            <legend className="section-label">Choose one answer</legend>
            <div className="sentence-choices">
              {completionChoices.map((choice, index) => (
                <label
                  className={`sentence-choice ${selectedCompletion === choice.label ? "is-selected" : ""} ${activity3Feedback === "incorrect" && selectedCompletion === choice.label ? "is-incorrect" : ""}`}
                  key={choice.id}
                >
                  <input
                    type="radio"
                    name="svo-03-choice"
                    value={choice.label}
                    checked={selectedCompletion === choice.label}
                    onChange={() => {
                      setSelectedCompletion(choice.label);
                      setActivity3Feedback("idle");
                    }}
                  />
                  <span className="choice-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {activity3Feedback === "incomplete" && (
            <div className="feedback neutral" role="status">
              <span className="feedback-icon">···</span>
              <div><strong>Choose an answer.</strong><p>Select one word before checking.</p></div>
            </div>
          )}

          {activity3Feedback === "incorrect" && (
            <div className="feedback incorrect" role="alert">
              <span className="feedback-icon">↺</span>
              <div>
                <strong>Not quite — try again.</strong>
                <p>The sentence already has a subject and verb. Choose what Daniel reads.</p>
                <div className="mini-rule"><span>Subject</span><b>+</b><span>Verb</span><b>+</b><span>Object</span></div>
              </div>
            </div>
          )}

          {activity3Feedback === "correct" && (
            <div className="feedback correct" role="status">
              <span className="feedback-icon">✓</span>
              <div>
                <strong>Sentence complete!</strong>
                <p><em>Daniel reads books.</em> follows Subject + Verb + Object.</p>
              </div>
              <span className="earned">+20 XP</span>
            </div>
          )}

          <div className="activity-actions">
            {activity3Feedback === "correct" ? (
              <button className="primary-button" type="button" disabled>Returning to journey…</button>
            ) : (
              <button className="primary-button" type="button" onClick={checkSentenceCompletion}>Check answer <span>→</span></button>
            )}
          </div>
        </section>
        ) : screen === "activity-4" ? (
        <section className="activity-card" aria-labelledby="activity-4-title">
          <div className="activity-heading">
            <div>
              <button className="back-button" type="button" onClick={returnToJourney}>← Jornada SVO</button>
              <p className="eyebrow">Activity 4 · SVO-04</p>
              <h1 id="activity-4-title">Sentence challenge</h1>
              <p className="instruction">Build a sentence about Maya writing letters. Choose only three words.</p>
            </div>
            <span className="xp-chip">+20 XP</span>
          </div>

          <div className="answer-section">
            <div className="section-label">
              <span>Your sentence</span>
              {challengeAnswer.length > 0 && activity4Feedback !== "correct" && (
                <button className="text-button" type="button" onClick={resetActivity4}>Clear</button>
              )}
            </div>
            <div
              className={`answer-zone ${activity4Feedback === "incorrect" ? "is-incorrect" : ""} ${activity4Feedback === "correct" ? "is-correct" : ""}`}
              aria-live="polite"
            >
              {challengeAnswer.length === 0 ? (
                <p className="placeholder">Choose three words from the challenge bank</p>
              ) : (
                challengeAnswer.map((tile, index) => (
                  <button
                    className="word-tile selected"
                    type="button"
                    key={tile.id}
                    onClick={() => returnToChallengeBank(tile)}
                    aria-label={`Remove ${tile.label} from position ${index + 1}`}
                    disabled={activity4Feedback === "correct"}
                  >
                    <span className="tile-order">{index + 1}</span>
                    {tile.label}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="word-bank-section">
            <span className="section-label">Challenge bank · 2 distractors</span>
            <div className="word-bank">
              {challengeAvailable.map((tile) => (
                <button
                  className="word-tile"
                  type="button"
                  key={tile.id}
                  onClick={() => addToChallenge(tile)}
                  disabled={challengeAnswer.length >= activity4ExpectedUnits.length}
                >
                  {tile.label}
                </button>
              ))}
            </div>
          </div>

          {activity4Feedback === "incomplete" && (
            <div className="feedback neutral" role="status">
              <span className="feedback-icon">···</span>
              <div><strong>Keep going.</strong><p>Choose exactly three words before checking your sentence.</p></div>
            </div>
          )}

          {activity4Feedback === "incorrect" && (
            <div className="feedback incorrect" role="alert">
              <span className="feedback-icon">↺</span>
              <div>
                <strong>Not quite — check your choices.</strong>
                <p>Use the person in the clue, then the matching action and object. Remove a word to try again.</p>
                <div className="mini-rule"><span>Subject</span><b>+</b><span>Verb</span><b>+</b><span>Object</span></div>
              </div>
            </div>
          )}

          {activity4Feedback === "correct" && (
            <div className="feedback correct" role="status">
              <span className="feedback-icon">✓</span>
              <div>
                <strong>Challenge complete!</strong>
                <p><em>Maya writes letters.</em> uses the correct words in SVO order.</p>
              </div>
              <span className="earned">+20 XP</span>
            </div>
          )}

          <div className="activity-actions">
            {activity4Feedback === "correct" ? (
              <button className="primary-button" type="button" disabled>Returning to journey…</button>
            ) : (
              <button className="primary-button" type="button" onClick={checkSentenceChallenge}>Check challenge <span>→</span></button>
            )}
          </div>
        </section>
        ) : (
        <section className="activity-card mastery-card" aria-labelledby="activity-5-title">
          <div className="activity-heading">
            <div>
              <button className="back-button" type="button" onClick={returnToJourney}>← Jornada SVO</button>
              <p className="eyebrow">Activity 5 · SVO-05</p>
              <h1 id="activity-5-title">Mastery challenge</h1>
              <p className="instruction">Complete all three sentences without structure hints.</p>
            </div>
            <span className="xp-chip">+30 XP</span>
          </div>

          <div className="mastery-status" aria-label={`Mastery progress: sentence ${masteryIndex + 1} of ${masteryItems.length}`}>
            <span>Sentence {masteryIndex + 1} of {masteryItems.length}</span>
            <div className="mastery-dots" aria-hidden="true">
              {masteryItems.map((item, index) => (
                <span className={index < masteryIndex ? "is-complete" : index === masteryIndex ? "is-current" : ""} key={item.id} />
              ))}
            </div>
          </div>

          <div className="mastery-clue">
            <span className="section-label">Your task</span>
            <p>{currentMasteryItem.clue}</p>
          </div>

          <div className="answer-section mastery-answer-section">
            <div className="section-label">
              <span>Your sentence</span>
              {masteryAnswer.length > 0 && activity5Feedback !== "correct" && (
                <button className="text-button" type="button" onClick={() => resetActivity5(masteryIndex)}>Clear</button>
              )}
            </div>
            <div
              className={`answer-zone ${activity5Feedback === "incorrect" ? "is-incorrect" : ""} ${activity5Feedback === "correct" ? "is-correct" : ""}`}
              aria-live="polite"
            >
              {masteryAnswer.length === 0 ? (
                <p className="placeholder">Choose three words to build the sentence</p>
              ) : (
                masteryAnswer.map((tile, index) => (
                  <button
                    className="word-tile selected"
                    type="button"
                    key={tile.id}
                    onClick={() => returnToMasteryBank(tile)}
                    aria-label={`Remove ${tile.label} from position ${index + 1}`}
                    disabled={activity5Feedback === "correct"}
                  >
                    <span className="tile-order">{index + 1}</span>
                    {tile.label}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="word-bank-section">
            <span className="section-label">Word bank</span>
            <div className="word-bank">
              {masteryAvailable.map((tile) => (
                <button
                  className="word-tile"
                  type="button"
                  key={tile.id}
                  onClick={() => addToMastery(tile)}
                  disabled={masteryAnswer.length >= currentMasteryItem.expectedUnits.length}
                >
                  {tile.label}
                </button>
              ))}
            </div>
          </div>

          {activity5Feedback === "incomplete" && (
            <div className="feedback neutral" role="status">
              <span className="feedback-icon">···</span>
              <div><strong>Sentence incomplete.</strong><p>Choose exactly three words before checking.</p></div>
            </div>
          )}

          {activity5Feedback === "incorrect" && (
            <div className="feedback incorrect" role="alert">
              <span className="feedback-icon">↺</span>
              <div>
                <strong>Not quite — try this sentence again.</strong>
                <p>Review the clue and your word choices, then rebuild the sentence.</p>
              </div>
            </div>
          )}

          {activity5Feedback === "correct" && (
            <div className="feedback correct" role="status">
              <span className="feedback-icon">✓</span>
              <div>
                <strong>{isFinalMasteryItem ? "Mastery achieved!" : "Sentence complete!"}</strong>
                <p>{isFinalMasteryItem ? "You completed all three sentences without structure hints." : `Sentence ${masteryIndex + 1} of ${masteryItems.length} is correct.`}</p>
              </div>
              {isFinalMasteryItem && <span className="earned">+30 XP</span>}
            </div>
          )}

          <div className="activity-actions">
            {activity5Feedback === "correct" ? (
              <button className="primary-button" type="button" disabled>{isFinalMasteryItem ? "Returning to journey…" : "Next sentence…"}</button>
            ) : (
              <button className="primary-button" type="button" onClick={checkMasterySentence}>Check sentence <span>→</span></button>
            )}
          </div>
        </section>
        )}
      </section>
      )}
    </main>
  );
}
