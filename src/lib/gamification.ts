export const BADGE_DEFS: Record<
  string,
  { title: string; emoji: string; description: string }
> = {
  first_prompt: {
    title: "Первый шаг",
    emoji: "🚀",
    description: "Отправили первый промпт",
  },
  passed: {
    title: "Зачёт",
    emoji: "✅",
    description: "Набрали 75% и выше",
  },
  excellent: {
    title: "Мастер промпта",
    emoji: "💎",
    description: "Достигли 92% — почти идеал",
  },
  persistent: {
    title: "Упорство",
    emoji: "🔥",
    description: "Три и более попыток — так растут навыки",
  },
  first_try_pass: {
    title: "С первого раза",
    emoji: "⚡",
    description: "Зачёт с первой попытки",
  },
};

const LEVEL_TITLES = [
  "Новичок",
  "Практик",
  "Специалист",
  "Эксперт",
  "Наставник",
  "Гуру промптов",
];

export interface LevelInfo {
  level: number;
  title: string;
  progress: number;
  xpInLevel: number;
  xpForLevel: number;
  totalXp: number;
}

/** XP за попытку: база + бонус за качество */
export function xpFromAttempt(
  percent: number,
  opts: { isNewBest: boolean; justPassed: boolean; isExcellent: boolean },
): number {
  let xp = 8 + Math.round(percent * 0.35);
  if (opts.isNewBest) xp += 5;
  if (opts.justPassed) xp += 20;
  if (opts.isExcellent) xp += 15;
  return xp;
}

export function levelFromXp(totalXp: number): LevelInfo {
  const base = 80;
  const growth = 55;
  let level = 1;
  let threshold = 0;
  let nextThreshold = base;

  while (totalXp >= nextThreshold && level < 50) {
    threshold = nextThreshold;
    level += 1;
    nextThreshold = threshold + base + (level - 1) * growth;
  }

  const xpInLevel = totalXp - threshold;
  const xpForLevel = nextThreshold - threshold;
  const progress = xpForLevel > 0 ? Math.min(100, (xpInLevel / xpForLevel) * 100) : 100;
  const title =
    LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)] ?? "Легенда";

  return {
    level,
    title,
    progress,
    xpInLevel,
    xpForLevel,
    totalXp,
  };
}

export function computeNewBadges(ctx: {
  badges: string[];
  attempt: number;
  percent: number;
  isPassed: boolean;
  isExcellent: boolean;
  justPassed: boolean;
}): string[] {
  const next = new Set(ctx.badges);
  if (ctx.attempt >= 1) next.add("first_prompt");
  if (ctx.isPassed) next.add("passed");
  if (ctx.isExcellent) next.add("excellent");
  if (ctx.attempt >= 3) next.add("persistent");
  if (ctx.justPassed && ctx.attempt === 1) next.add("first_try_pass");
  return [...next];
}

export function badgesEarned(before: string[], after: string[]): string[] {
  const set = new Set(before);
  return after.filter((b) => !set.has(b));
}
