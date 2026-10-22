import type { ChatMessage } from "../types";

const KEY = "prompt-trainer-v1";
const WELCOME_SEEN_KEY = "prompt-trainer-welcome-v2";
/** @deprecated миграция на welcome-v2 */
const MOBILE_NAV_HINT_KEY = "prompt-trainer-mobile-nav-hint-v1";

export interface PersistedState {
  version: 2;
  assignmentId: string;
  attempt: number;
  bestScore: number;
  /** Хотя бы раз набран порог зачёта (75) */
  hasPassed: boolean;
  messages: ChatMessage[];
  totalXp: number;
  badges: string[];
}

type LegacyState = Omit<PersistedState, "version" | "totalXp" | "badges"> & {
  version: 1;
};

function migrateMessages(messages: ChatMessage[]): ChatMessage[] {
  if (!messages.length) return messages;
  const first = messages[0];
  if (
    first.role === "assistant" &&
    !first.evaluation &&
    first.content.includes("**Ситуация**")
  ) {
    return messages.slice(1);
  }
  return messages;
}

function migrateV1(data: LegacyState): PersistedState {
  const badges: string[] = [];
  if (data.attempt >= 1) badges.push("first_prompt");
  if (data.hasPassed) badges.push("passed");
  if (data.bestScore >= 92) badges.push("excellent");
  if (data.attempt >= 3) badges.push("persistent");
  const totalXp = Math.min(
    500,
    data.attempt * 12 + Math.round(data.bestScore * 0.4) + (data.hasPassed ? 25 : 0),
  );
  return {
    version: 2,
    assignmentId: data.assignmentId,
    attempt: data.attempt,
    bestScore: data.bestScore,
    hasPassed: data.hasPassed,
    messages: migrateMessages(data.messages),
    totalXp,
    badges,
  };
}

export function loadState(assignmentId: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedState | LegacyState;
    if (data.assignmentId !== assignmentId) return null;
    if (data.version === 1) return migrateV1(data);
    if (data.version !== 2) return null;
    return {
      ...data,
      messages: migrateMessages(data.messages),
      totalXp: data.totalXp ?? 0,
      badges: data.badges ?? [],
    };
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function clearState(): void {
  localStorage.removeItem(KEY);
}

export function hasSeenWelcome(): boolean {
  try {
    if (localStorage.getItem(WELCOME_SEEN_KEY) === "1") return true;
    // уже видели старый мобильный онбординг
    return localStorage.getItem(MOBILE_NAV_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}
