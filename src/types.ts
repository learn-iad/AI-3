export type CriterionId =
  | "role"
  | "context"
  | "task"
  | "tone"
  | "constraints"
  | "outputFormat";

export interface CriterionResult {
  id: CriterionId;
  label: string;
  score: number;
  maxScore: number;
  found: boolean;
  feedback: string;
  hint: string;
}

export const PASS_PERCENT = 75;
export const EXCELLENT_PERCENT = 92;
/** Порог «пункт чек-листа закрыт» и блока «Что уже хорошо» */
export const CRITERION_STRONG_RATIO = 0.55;

export interface EvaluationResult {
  totalScore: number;
  maxScore: number;
  percent: number;
  criteria: CriterionResult[];
  summary: string;
  strengths: string[];
  improvements: string[];
  isPassed: boolean;
  isExcellent: boolean;
}

export interface Assignment {
  id: string;
  title: string;
  intro: string;
  situation: string;
  goal: string;
  /** Критерии, обязательные для этого задания */
  requiredCriteria: CriterionId[];
  /** Формат вывода желателен, но не обязателен */
  optionalCriteria?: CriterionId[];
}

export type ChatRole = "assistant" | "user" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  evaluation?: EvaluationResult;
  attempt?: number;
}
