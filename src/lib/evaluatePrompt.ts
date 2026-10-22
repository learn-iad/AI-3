import type {
  Assignment,
  CriterionId,
  CriterionResult,
  EvaluationResult,
} from "../types";
import {
  CRITERION_STRONG_RATIO,
  EXCELLENT_PERCENT,
  PASS_PERCENT,
} from "../types";

export function isCriterionStrong(
  c: Pick<CriterionResult, "score" | "maxScore" | "found">,
): boolean {
  return c.found && c.score >= c.maxScore * CRITERION_STRONG_RATIO;
}

const CRITERION_META: Record<
  CriterionId,
  { label: string; weight: number; hint: string }
> = {
  role: {
    label: "Роль",
    weight: 12,
    hint: "Коротко: «Ты — аналитик данных» или «Действуй как автор управленческих отчётов».",
  },
  context: {
    label: "Контекст",
    weight: 18,
    hint: "Источник данных (таблица, CSV), период, аудитория (руководство, отдел) и ключевые метрики из задания.",
  },
  task: {
    label: "Задача",
    weight: 25,
    hint: "Что нужно от ИИ: отчёт, выводы, тренды, аномалии, рекомендации — не одно «сделай отчёт по данным».",
  },
  tone: {
    label: "Тон и язык",
    weight: 15,
    hint: "Деловой, понятный нетехнической аудитории: без жаргона, с акцентом на смысл цифр.",
  },
  constraints: {
    label: "Ограничения",
    weight: 12,
    hint: "Объём, «не выдумывай цифры», опирайся только на приложенные данные, лимит рекомендаций.",
  },
  outputFormat: {
    label: "Формат вывода",
    weight: 10,
    hint: "Структура ответа: резюме, разделы, списки, таблица — как вам удобно читать результат.",
  },
};

/** Латиница + кириллица — в JS \\w кириллицу не матчит */
const CY = "a-zа-яё0-9";
const WORD = `[${CY}]+`;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

const TASK_DETAIL_RE =
  /(отчет|отчёт|вывод|рекомен|тренд|аномал|сравн|динамик|kpi|метрик|раздел|структур|интерпрет|сводк|конверс|выручк|сделок|канал)/;

/** Слишком общая просьба «сделай отчёт» без деталей задачи */
function capVagueReportTask(text: string, ratio: number): number {
  const n = normalize(text);
  const words = n.split(/\s+/).filter(Boolean).length;
  const genericOpen =
    /^(напиши|составь|сделай|подготов|помоги(\s+(мне|\s+)?(написать|составить|сделать))?)\s+(отчет|отчёт|анализ)\b/.test(
      n,
    ) ||
    (/^(проанализируй|разбери)\s+(данн|таблиц|метрик)/.test(n) && words <= 8) ||
    (/^(напиши|составь)\s+/.test(n) &&
      /(отчет|отчёт|анализ\s+дан)/.test(n) &&
      words <= 8);
  if (genericOpen && !TASK_DETAIL_RE.test(n)) {
    return Math.min(ratio, 0.34);
  }
  return ratio;
}

/** Промпт про письмо/переписку, а не про отчёт по данным */
function capOffTopicReportPrompt(
  text: string,
  id: CriterionId,
  ratio: number,
): number {
  const n = normalize(text);
  const letterish = /(письм|email|e-mail|переписк|служебн)/.test(n);
  const reportish =
    /(отчет|отчёт|данн|метрик|таблиц|csv|excel|анализ\s+дан|выручк|конверс|показател|kpi)/.test(
      n,
    );
  if (letterish && !reportish && (id === "context" || id === "task")) {
    return Math.min(ratio, 0.38);
  }
  return ratio;
}

/** Данные упомянуты, но нет периода, аудитории или метрик */
function capSparseReportContext(text: string, ratio: number): number {
  const n = normalize(text);
  const words = n.split(/\s+/).filter(Boolean).length;
  const hasDataCue = /(данн|таблиц|csv|excel|метрик|показател|выручк|сделок)/.test(
    n,
  );
  const hasSituation =
    /(период|месяц|квартал|недел|руковод|отдел|продаж|конверс|канал|план|аудитор|заказчик|bi|дашборд)/.test(
      n,
    );
  if (words <= 14 && hasDataCue && !hasSituation) {
    return Math.min(ratio, 0.42);
  }
  return ratio;
}

type Matcher = {
  patterns: RegExp[];
  keywords: string[];
  /** Дополнительные баллы за сильные формулировки */
  strong?: RegExp[];
};

const MATCHERS: Record<CriterionId, Matcher> = {
  role: {
    patterns: [
      new RegExp(`ты\\s*[-—–:]\\s*${WORD}`, "i"),
      new RegExp(`я\\s*[-—–:]\\s*${WORD}`, "i"),
      /^(роль|role)\s*[:—–]/im,
      /действуй\s+как/,
      /выступай\s+в\s+роли/,
      /представь\s*,?\s*что\s+ты/,
      /в\s+роли\s+/,
      /как\s+(эксперт|методист|аналитик|юрист|редактор|консультант|копирайтер|секретар)/,
      /аналитик\s+(данных|данные)?/,
      /(методист|юрист|редактор|консультант|эксперт|секретар)\s+(данных|данные)?/,
      /(помощник|ассистент)\s+(по\s+)?(отчет|отчёт|анализ|данн|метрик)/,
      /(автор|составитель)\s+(отчет|отчёт|аналитическ)/,
      /специалист\s+по\s+(данн|отчет|отчёт|bi)/,
    ],
    keywords: [
      "роль",
      "методист",
      "аналитик",
      "редактор",
      "эксперт",
      "консультант",
      "наставник",
      "специалист по",
      "данным",
      "отчет",
      "отчёт",
      "bi-аналит",
    ],
    strong: [
      /ты\s*[-—–]\s*(аналитик|методист|редактор)/,
      /аналитик\s+(данных|данные|отчет|отчёт)/,
      /помощник\s+по\s+(анализ|отчет|отчёт)/,
    ],
  },
  context: {
    patterns: [
      /(руководств|руководител|директор|топ-менедж|начальник\s+отдел)/,
      /(отдел|команда|продаж|маркетинг|коммерч)/,
      /(таблиц|csv|excel|xlsx|google\s+sheets|выгрузк)/,
      /(данн|метрик|показател|kpi|дашборд)/,
      /(выручк|сделок|конверс|воронк|канал|лид)/,
      /(период|месяц|квартал|недел|год|за\s+прошл)/,
      /(план|факт|отклонен|benchmark|целев)/,
      /(ситуац|контекст|факт|обстоятельств)/,
      /(приложен|ниже|вставлен|исходн|фрагмент|файл|dataset)/,
      /(нетехнич|бизнес-аудитор|для\s+руковод)/,
      /^(контекст|context)\s*[:—–]/im,
    ],
    keywords: [
      "руководит",
      "директор",
      "отдел",
      "продаж",
      "таблиц",
      "csv",
      "excel",
      "данн",
      "метрик",
      "выручк",
      "конверс",
      "сделок",
      "канал",
      "период",
      "месяц",
      "квартал",
      "план",
      "показател",
      "аудитор",
    ],
    strong: [
      /(таблиц|csv|excel).*(продаж|метрик|выручк)/,
      /(руководств|директор).*(отчет|отчёт|месяц|квартал)/,
    ],
  },
  task: {
    patterns: [
      /(состав|подготов|напиш|сформируй|сделай).*(отчет|отчёт|аналитическ|сводк)/,
      /(отчет|отчёт)\s+(по\s+)?(данн|метрик|продаж|показател)/,
      /(проанализируй|разбери|интерпретируй).*(данн|таблиц|метрик|показател)/,
      /(вывод|insight|инсайт|ключев(ые|ой)\s+(вывод|тезис))/,
      /(тренд|динамик|рост|падени|сравн).*(период|месяц|канал|метрик)/,
      /(аномал|отклонен|всплеск|просадк)/,
      /(рекомендац|предложен|что\s+сделать|next\s+step)/,
      /(структурир|разбей).*(отчет|отчёт|ответ|материал)/,
      /^(задача|task)\s*[:—–]/im,
    ],
    keywords: [
      "отчет",
      "отчёт",
      "анализ",
      "вывод",
      "рекомендац",
      "тренд",
      "аномал",
      "сравни",
      "динамик",
      "сводк",
      "интерпрет",
      "метрик",
      "напиши",
      "составь",
    ],
    strong: [
      /отчет\s+(с\s+)?(вывод|рекомен)/,
      /(вывод|рекомендац).*(по\s+)?данн/,
    ],
  },
  tone: {
    patterns: [
      new RegExp(`(прост[${CY}]*\\s+язык|понятн[${CY}]*\\s+язык|доступн)`, "i"),
      /(доброжелательн|вежлив|дружелюбн|уважительн|корректн|сдержанн)/,
      new RegExp(`без\\s+(жаргон|канцеляр|сложн[${CY}]*\\s+термин|паник|эмоци|оправдан)`, "i"),
      /(профессиональн|нейтральн|делов|официально-делов)/,
      /(на\s+«?вы»?|обращени\s+на\s+вы)/,
      /(plain\s+language|простыми\s+словами)/,
      new RegExp(`понятн[${CY}]*\\s+язык`, "i"),
      /доброжелательн/,
    ],
    keywords: [
      "понятн",
      "простым",
      "простой",
      "доброжелатель",
      "без жаргона",
      "канцеляр",
      "доступн",
      "человеческ",
      "нейтральн",
      "вежлив",
      "уважитель",
      "корректн",
      "деловой",
      "сдержан",
    ],
    strong: [
      new RegExp(`прост[${CY}]*\\s+язык`, "i"),
      /доброжелательн/,
      /(делов|уважительн).*(тон|стиль)/,
    ],
  },
  constraints: {
    patterns: [
      /(до\s+\d+\s*(знак|слов|абзац|стр|строк|предложен))/,
      new RegExp(
        `(в\\s+)?(одном|двух|трех|трёх|четырех|пяти|\\d+)\\s+предложен`,
        "i",
      ),
      /(\d+\s*[-–]\s*\d+\s*(знак|слов|пункт))/,
      /(не\s+более|не\s+больше|максимум|огранич)/,
      /(только\s+(на\s+основе|из\s+текста|по\s+документ|из\s+контекста|из\s+факт))/,
      /(не\s+(меняй|искаж).*(факт|цифр|дат))/,
      /(не\s+(выдумыв|придумыв|додумыв|фантаз))/,
      /(опирайся|используй\s+только|строго\s+по\s+текст)/,
      /(если\s+.*\s+не\s+указан)/,
      /\b\d+\s*(знак|слов|абзац|стр|строк|предложен)\b/,
    ],
    keywords: [
      "знак",
      "слов",
      "объем",
      "объём",
      "лимит",
      "огранич",
      "не выдумыв",
      "только текст",
      "основе документа",
      "из контекста",
      "цифр",
      "дат",
      "подпис",
      "факт",
      "точность",
      "предложен",
      "1000",
      "500",
    ],
    strong: [/до\s+\d+\s*знак/, /не\s+выдумыв/],
  },
  outputFormat: {
    patterns: [
      /(маркированн|нумерованн)\s+список/,
      new RegExp(`(формат|структур[${CY}]*\\s+ответ)`, "i"),
      /(блок|раздел|заголовок)\s*[«:"]/,
      /(таблиц|markdown|md)/,
      /(суть\s*[:—]|важно\s+знать|ключевые\s+пункты\s*[:—])/,
      /(executive\s+summary|резюме\s*[:—]|кратк(ое|ая)\s+сводк)/,
      /(введени[ея]|заключени[ея]|основн(ые|ой)\s+раздел)/,
      /(\d+\s*[-–]\s*\d+\s+пункт)/,
    ],
    keywords: [
      "список",
      "формат",
      "структура",
      "раздел",
      "блок",
      "таблица",
      "заголовок",
      "маркирован",
      "нумерац",
      "резюме",
      "executive",
      "сводк",
    ],
    strong: [
      new RegExp(`маркированн[${CY}]*\\s+список`, "i"),
      new RegExp(`структур[${CY}]*\\s+ответ`, "i"),
    ],
  },
};

function scoreCriterion(id: CriterionId, raw: string): Omit<CriterionResult, "id" | "label" | "hint"> {
  const text = normalize(raw);
  const meta = CRITERION_META[id];
  const m = MATCHERS[id];
  const maxScore = meta.weight;

  if (raw.trim().length < 10) {
    return {
      score: 0,
      maxScore,
      found: false,
      feedback: "Промпт слишком короткий — добавьте роль, задачу и контекст.",
    };
  }

  let patternHits = 0;
  for (const p of m.patterns) {
    if (p.test(text)) patternHits++;
  }

  let keywordHits = 0;
  for (const kw of m.keywords) {
    if (text.includes(normalize(kw))) keywordHits++;
  }

  let hasStrong = false;
  if (m.strong) {
    for (const s of m.strong) {
      if (s.test(text)) {
        hasStrong = true;
        break;
      }
    }
  }

  let ratio = 0;
  if (patternHits > 0) ratio += 0.38;
  if (patternHits > 1) ratio += 0.12;
  if (keywordHits > 0) ratio += 0.28;
  if (keywordHits > 1) ratio += 0.1;
  if (hasStrong) ratio = Math.max(ratio, 0.92);

  // Короткая формулировка достаточна — не требуем «простыни»
  if (patternHits >= 1) ratio = Math.max(ratio, 0.55);
  if (patternHits >= 1 && keywordHits >= 1) ratio = Math.max(ratio, 0.78);
  if (patternHits >= 2 && keywordHits >= 1) ratio = Math.max(ratio, 0.88);

  if (id === "task") {
    ratio = capVagueReportTask(text, ratio);
    ratio = capOffTopicReportPrompt(text, id, ratio);
    if (/^сократи\b/.test(text)) {
      ratio = Math.min(ratio, 0.32);
    }
  }
  if (id === "context") {
    ratio = capSparseReportContext(text, ratio);
    ratio = capOffTopicReportPrompt(text, id, ratio);
  }

  ratio = Math.min(1, ratio);
  const score = Math.round(ratio * maxScore);
  const found = score >= maxScore * 0.42;

  let feedback: string;
  if (
    id === "task" &&
    score > 0 &&
    score < maxScore * CRITERION_STRONG_RATIO &&
    capVagueReportTask(text, 1) <= 0.34
  ) {
    feedback =
      "Задача сформулирована слишком общо — уточните, что должно быть в отчёте.";
  } else if (
    id === "context" &&
    score > 0 &&
    score < maxScore * CRITERION_STRONG_RATIO &&
    capSparseReportContext(text, 1) <= 0.42
  ) {
    feedback =
      "Данные упомянуты, но не хватает периода, аудитории или метрик из задания.";
  } else if (score >= maxScore * 0.85) {
    feedback = "Есть, этого достаточно.";
  } else if (found) {
    feedback = "Учтено — можно оставить как есть или чуть уточнить.";
  } else {
    feedback = "Не хватает явной формулировки — см. подсказку.";
  }

  return { score, maxScore, found, feedback };
}

function buildSummary(percent: number, strengths: string[]): string {
  if (percent >= 92) {
    return "Отличный промпт: можно отправлять в ИИ — роль, контекст, задача по отчёту и рамки на месте.";
  }
  if (percent >= 75) {
    return strengths.length
      ? `Короткий рабочий промпт — основные элементы есть (${strengths.slice(0, 3).join("; ")}).`
      : "Короткий рабочий промпт — основные элементы на месте, можно отправлять в ИИ.";
  }
  if (percent >= 55) {
    return "Промпт частично готов. Добавьте только то, чего не хватает — без длинных простыней.";
  }
  if (percent >= 35) {
    return "Есть зачатки структуры, но несколько блоков не видны явно. Смотрите подсказки ниже.";
  }
  return "Промпт слишком общий (как «сделай отчёт по данным»). Добавьте роль, контекст и задачу отдельными короткими фразами.";
}

function formatImprovementHint(hint: string, optional: boolean): string {
  const cleaned = hint.replace(/^по желанию:\s*/i, "").trim();
  if (optional) {
    const body =
      cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
    return `Дополнительно — ${body}`;
  }
  return cleaned;
}

export function evaluatePrompt(
  promptText: string,
  assignment: Assignment,
): EvaluationResult {
  const activeIds: CriterionId[] = [
    ...assignment.requiredCriteria,
    ...(assignment.optionalCriteria ?? []),
  ];

  // Для расчёта процента обязательные критерии = 100%, опциональные дают бонус но cap at 100
  const requiredMax = assignment.requiredCriteria.reduce(
    (s, id) => s + CRITERION_META[id].weight,
    0,
  );
  const optionalMax = (assignment.optionalCriteria ?? []).reduce(
    (s, id) => s + CRITERION_META[id].weight,
    0,
  );

  const criteria: CriterionResult[] = activeIds.map((id) => {
    const meta = CRITERION_META[id];
    const partial = scoreCriterion(id, promptText);
    return {
      id,
      label: meta.label,
      hint: meta.hint,
      ...partial,
    };
  });

  const requiredScore = criteria
    .filter((c) => assignment.requiredCriteria.includes(c.id))
    .reduce((s, c) => s + c.score, 0);

  const optionalScore = criteria
    .filter((c) => assignment.optionalCriteria?.includes(c.id))
    .reduce((s, c) => s + c.score, 0);

  // Процент: обязательные на 100%, опциональный формат — до +10% но итог cap 100
  let percent = Math.round((requiredScore / requiredMax) * 100);
  if (optionalMax > 0 && optionalScore > 0) {
    const bonus = Math.round((optionalScore / optionalMax) * 8);
    percent = Math.min(100, percent + bonus);
  }

  const normalizedPrompt = normalize(promptText);
  const letterWithoutReport =
    /(письм|email|e-mail|переписк|служебн)/.test(normalizedPrompt) &&
    !/(отчет|отчёт|данн|метрик|таблиц|csv|excel|выручк|конверс|kpi)/.test(
      normalizedPrompt,
    );
  if (letterWithoutReport) {
    percent = Math.min(percent, 52);
  }

  const strengths: string[] = [];
  const improvements: string[] = [];

  for (const c of criteria) {
    const isRequired = assignment.requiredCriteria.includes(c.id);
    if (isCriterionStrong(c)) {
      strengths.push(`${c.label.toLowerCase()} (${c.score}/${c.maxScore})`);
    } else if (isRequired && !c.found) {
      improvements.push(formatImprovementHint(c.hint, false));
    } else if (!isRequired && !c.found && c.id === "outputFormat") {
      improvements.push(formatImprovementHint(c.hint, true));
    }
  }

  const totalScore = requiredScore + optionalScore;
  const maxScore = requiredMax + optionalMax;

  return {
    totalScore,
    maxScore,
    percent,
    criteria,
    strengths,
    improvements,
    summary: buildSummary(percent, strengths),
    isPassed: percent >= PASS_PERCENT,
    isExcellent: percent >= EXCELLENT_PERCENT,
  };
}

export function formatEvaluationMessage(
  evaluation: EvaluationResult,
  userName?: string,
): string {
  const greeting = userName ? `${userName}, ` : "";
  const lines: string[] = [
    `${greeting}**Оценка: ${evaluation.percent} из 100**`,
    "",
    evaluation.summary,
  ];

  if (evaluation.strengths.length) {
    lines.push("", "**Что уже хорошо:**");
    for (const s of evaluation.strengths) {
      lines.push(`• ${s}`);
    }
  }

  const requiredGaps = evaluation.improvements.filter((i) =>
    i.startsWith("По желанию") ? false : true,
  );
  if (requiredGaps.length) {
    lines.push("", "**Как усилить:**");
    for (const imp of evaluation.improvements) {
      lines.push(`• ${imp}`);
    }
  }

  if (evaluation.isExcellent) {
    lines.push(
      "",
      "Промпт близок к **идеалу**. Можете закрепить результат ещё одной попыткой или перейти к другим материалам курса.",
    );
  } else if (evaluation.isPassed) {
    lines.push(
      "",
      "**Зачёт** (порог 75%). Задание можно считать выполненным.",
      "",
      "Хотите **довести промпт до идеала** (92+)? Напишите улучшенный вариант ниже — разбор подскажет, что ещё усилить.",
    );
  } else {
    lines.push(
      "",
      `До **зачёта** не хватает баллов (нужно ${PASS_PERCENT}). Доработайте промпт по подсказкам выше и отправьте новую попытку.`,
    );
  }

  return lines.join("\n");
}
