import { assignments } from "../data/assignments";
import { evaluatePrompt } from "./evaluatePrompt";

const assignment = assignments[0];

const samples: { name: string; text: string; expectMin: number; expectMax: number }[] = [
  {
    name: "bad baseline",
    text: "Сделай отчёт по данным продаж за месяц",
    expectMin: 38,
    expectMax: 55,
  },
  {
    name: "bad one-liner",
    text: "Проанализируй таблицу",
    expectMin: 8,
    expectMax: 28,
  },
  {
    name: "Olga-like",
    text:
      "Помоги составить отчёт для руководства по продажам за месяц: выручка, сделки, конверсия по каналам понятным языком",
    expectMin: 58,
    expectMax: 75,
  },
  {
    name: "short structured",
    text: `Ты — аналитик данных
Ниже таблица продаж за прошлый месяц: выручка, сделки, конверсия по каналам, отклонение от плана
Составь отчёт: главные выводы, тренды, аномалии, 2–3 рекомендации
Деловой тон, понятно нетехнической аудитории
До 1500 знаков, не выдумывай цифры`,
    expectMin: 75,
    expectMax: 100,
  },
  {
    name: "strong",
    text: `Ты — аналитик данных в отделе продаж.
Контекст: приложена таблица (CSV) за прошлый месяц — выручка, число сделок, конверсия по каналам, факт vs план. Аудитория — руководство, без технического бэкграунда.
Задача: управленческий отчёт — краткое резюме, динамика и сравнение каналов, аномалии и отклонения от плана, 2–3 практические рекомендации.
Тон: деловой, ясный, без жаргона и лишних деталей.
Ограничения: до 1200 знаков; используй только цифры из таблицы, не придумывай значения.
Формат: резюме (3–4 предложения), затем разделы с маркированными списками.`,
    expectMin: 90,
    expectMax: 100,
  },
  {
    name: "false constraints from korotko",
    text: "Помоги с отчётом по метрикам для директора — коротко и по делу",
    expectMin: 22,
    expectMax: 40,
  },
  {
    name: "legacy letter prompt",
    text: "Ты — редактор. Напиши письмо руководителю о задержке проекта. Деловой тон. До 1000 знаков.",
    expectMin: 35,
    expectMax: 58,
  },
];

let failed = 0;
for (const s of samples) {
  const r = evaluatePrompt(s.text, assignment);
  const ok = r.percent >= s.expectMin && r.percent <= s.expectMax;
  console.log(
    `${ok ? "OK" : "FAIL"} ${s.name}: ${r.percent}% (expected ${s.expectMin}-${s.expectMax})`,
  );
  if (!ok) failed++;
}

if (failed > 0) process.exit(1);
