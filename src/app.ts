import { assignments } from "./data/assignments";
import {
  evaluatePrompt,
  formatEvaluationMessage,
  isCriterionStrong,
} from "./lib/evaluatePrompt";
import {
  BADGE_DEFS,
  badgesEarned,
  computeNewBadges,
  levelFromXp,
  xpFromAttempt,
  type LevelInfo,
} from "./lib/gamification";
import { renderMarkdownLite } from "./lib/renderMarkdown";
import {
  hasSeenWelcome,
  loadState,
  markWelcomeSeen,
  saveState,
  type PersistedState,
} from "./lib/storage";
import type { Assignment, ChatMessage, CriterionResult, EvaluationResult } from "./types";
import { EXCELLENT_PERCENT, PASS_PERCENT } from "./types";
import { applyStudioTheme } from "./lib/studioTheme";
import "./styles/global.css";
import "./styles/themes.css";
import "./styles/goal-variants.css";

type AttemptPillTier = "none" | "high" | "mid" | "low";

function lastEvaluationPercent(messages: ChatMessage[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const ev = messages[i]?.evaluation;
    if (ev) return ev.percent;
  }
  return null;
}

/** high — зачёт (75%+), mid — средний результат, low — слабая попытка */
function attemptPillTier(
  attempt: number,
  messages: ChatMessage[],
  bestScore: number,
): AttemptPillTier {
  if (attempt === 0) return "none";
  const pct = lastEvaluationPercent(messages) ?? bestScore;
  if (pct >= PASS_PERCENT) return "high";
  if (pct >= 45) return "mid";
  return "low";
}

const QUEST_ITEMS: { id: string; label: string; bonus?: boolean }[] = [
  { id: "role", label: "Роль для ИИ" },
  { id: "context", label: "Контекст: данные, период и аудитория" },
  { id: "task", label: "Чёткая задача" },
  { id: "tone", label: "Тон и язык" },
  { id: "constraints", label: "Ограничения" },
  { id: "outputFormat", label: "Формат ответа", bonus: true },
];

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

function scoreRingSvg(percent: number, size = 72): string {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  const color =
    percent >= EXCELLENT_PERCENT
      ? "var(--score-high)"
      : percent >= PASS_PERCENT
        ? "var(--score-mid)"
        : "var(--score-low)";
  return `<svg width="${size}" height="${size}" class="score-ring" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-muted)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" class="score-ring__text">${percent}</text>
  </svg>`;
}

function criteriaHtml(criteria: CriterionResult[]): string {
  const items = criteria
    .map((c) => {
      const pct = c.maxScore ? Math.round((c.score / c.maxScore) * 100) : 0;
      const ok = isCriterionStrong(c) ? " criteria__fill--ok" : "";
      return `<li class="criteria__item">
        <div class="criteria__head"><span class="criteria__label">${c.label}</span><span class="criteria__pts">${c.score}/${c.maxScore}</span></div>
        <div class="criteria__track"><div class="criteria__fill${ok}" style="width:${pct}%"></div></div>
      </li>`;
    })
    .join("");
  return `<ul class="criteria">${items}</ul>`;
}

function feedbackStatusHtml(evaluation: EvaluationResult): string {
  if (evaluation.isExcellent) {
    return `<span class="feedback__status feedback__status--excellent">💎 Близко к идеалу</span>`;
  }
  if (evaluation.isPassed) {
    return `<span class="feedback__status feedback__status--pass">✓ Зачёт (${PASS_PERCENT}%+)</span>`;
  }
  return `<span class="feedback__status feedback__status--retry">↻ Нужна доработка</span>`;
}

function feedbackHtml(msg: ChatMessage, lastXp?: number): string {
  const ev = msg.evaluation!;
  const strengths =
    ev.strengths.length > 0
      ? `<div class="feedback__section feedback__section--good">
          <p class="feedback__section-title">Что уже хорошо</p>
          <ul class="feedback__list">${ev.strengths.map((s) => `<li>${s}</li>`).join("")}</ul>
        </div>`
      : "";
  const improvements =
    ev.improvements.length > 0
      ? `<div class="feedback__section feedback__section--improve">
          <p class="feedback__section-title">Как усилить</p>
          <ul class="feedback__list">${ev.improvements.map((s) => `<li>${s}</li>`).join("")}</ul>
        </div>`
      : "";

  let cta = "";
  if (ev.isExcellent) {
    cta =
      "<p class=\"feedback__cta\">Промпт на высоком уровне. Можете закрепить результат ещё одной попыткой или перейти к следующему материалу.</p>";
  } else if (ev.isPassed) {
    cta = `<p class="feedback__cta"><strong>Задание выполнено.</strong> Хотите довести промпт до идеала (${EXCELLENT_PERCENT}+)? Отправьте улучшенный вариант — разбор подскажет, что ещё усилить.</p>`;
  } else {
    cta = `<p class="feedback__cta">До зачёта не хватает баллов (нужно <strong>${PASS_PERCENT}</strong>). Доработайте промпт по подсказкам и отправьте новую попытку.</p>`;
  }

  const xpBadge =
    lastXp != null && lastXp > 0
      ? `<span class="feedback__xp">+${lastXp} XP</span>`
      : "";

  return `<div class="feedback">
    <div class="feedback__hero">
      ${scoreRingSvg(ev.percent)}
      <div class="feedback__score-text">
        <h3>Оценка: ${ev.percent} из 100</h3>
        <p>${ev.summary}</p>
        ${feedbackStatusHtml(ev)}${xpBadge}
      </div>
    </div>
    ${strengths}
    ${improvements}
    ${cta}
    ${criteriaHtml(ev.criteria)}
  </div>`;
}

function messageHtml(msg: ChatMessage, lastFeedbackXp?: number): string {
  const isUser = msg.role === "user";
  if (!isUser && msg.evaluation) {
    return `<div class="message message--assistant">
      <div class="message__avatar" aria-hidden="true">AI</div>
      <div class="message__body">${feedbackHtml(msg, lastFeedbackXp)}</div>
    </div>`;
  }

  const meta =
    msg.attempt != null && isUser
      ? `<span class="message__meta">Попытка ${msg.attempt}</span>`
      : "";

  return `<div class="message message--${msg.role}">
    <div class="message__avatar" aria-hidden="true">${isUser ? "Вы" : "AI"}</div>
    <div class="message__body">
      <div class="message__bubble">
        <div class="message__content">${renderMarkdownLite(msg.content)}</div>
        ${meta}
      </div>
    </div>
  </div>`;
}

function questProgressFromEvaluation(evaluation: EvaluationResult | null): Set<string> {
  const done = new Set<string>();
  if (!evaluation) return done;
  for (const c of evaluation.criteria) {
    if (isCriterionStrong(c)) done.add(c.id);
  }
  return done;
}

function missionBoardHtml(
  assignment: Assignment,
  questDone: Set<string>,
): string {
  const doneCount = QUEST_ITEMS.filter((q) => questDone.has(q.id)).length;
  const trackPct = Math.round((doneCount / QUEST_ITEMS.length) * 100);
  const trackItems = QUEST_ITEMS.map((q, i) => {
    const isDone = questDone.has(q.id);
    const isCurrent =
      !isDone && (i === 0 || questDone.has(QUEST_ITEMS[i - 1]!.id));
    const state = isDone
      ? " studio-track__node--done"
      : " studio-track__node--pending";
    const current = isCurrent ? " studio-track__node--current" : "";
    return `<li class="studio-track__node${state}${current}"><span class="studio-track__dot" aria-hidden="true"></span><span class="studio-track__name">${q.label}</span></li>`;
  }).join("");

  return `<div class="studio-board" aria-label="Доска задания">
    <header class="studio-board__head studio-board__head--compact">
      <h2 class="studio-board__title">${assignment.title}</h2>
    </header>
    <div class="studio-bento">
      <article class="studio-bento__cell studio-bento__cell--context context-block">
        <h3 class="studio-bento__label">Контекст</h3>
        <p>${assignment.situation}</p>
      </article>
      <article class="studio-bento__cell studio-bento__cell--goal goal-block">
        <span class="goal-block__icon" aria-hidden="true"></span>
        <h3 class="studio-bento__label">Цель</h3>
        <p>${assignment.goal}</p>
      </article>
    </div>
    <section class="studio-track" aria-label="Прогресс по чек-листу">
      <div class="studio-track__meta">
        <span class="studio-track__caption">Готовность промпта</span>
        <span class="studio-track__pct">${trackPct}%</span>
      </div>
      <div class="studio-track__bar" aria-hidden="true"><span style="width:${trackPct}%"></span></div>
      <ol class="studio-track__nodes">${trackItems}</ol>
    </section>
  </div>`;
}

function headerHudHtml(
  level: LevelInfo,
  bestScore: number,
  hasPassed: boolean,
  badges: string[],
  newBadgeIds: string[],
): string {
  const chips: string[] = [];
  if (hasPassed) {
    chips.push('<span class="header__chip header__chip--pass">Зачёт ✓</span>');
  }
  if (bestScore > 0) {
    chips.push(
      `<span class="header__chip header__chip--score">Рекорд: <strong>${bestScore}%</strong></span>`,
    );
  }

  const badgeIcons = badges
    .map((id) => {
      const def = BADGE_DEFS[id];
      if (!def) return "";
      const isNew = newBadgeIds.includes(id) ? " badge-icon--new" : "";
      return `<span class="badge-icon${isNew}" title="${escapeAttr(def.title)} — ${escapeAttr(def.description)}">${def.emoji}</span>`;
    })
    .join("");

  return `<div class="header__hud">
    <div class="level-pill" title="Опыт за попытки и качество промптов">
      <span class="level-pill__badge">Lv ${level.level}</span>
      <div class="level-pill__meta">
        <div class="level-pill__row"><strong>${level.title}</strong><span>${level.xpInLevel}/${level.xpForLevel} XP</span></div>
        <div class="level-pill__bar"><div class="level-pill__fill" style="width:${level.progress}%"></div></div>
      </div>
    </div>
    ${badgeIcons ? `<div class="badges-row" aria-label="Достижения">${badgeIcons}</div>` : ""}
    ${chips.join("")}
  </div>`;
}

const LMS_URL = "https://lms.reso.ru/";

const LOGO_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
  <path d="M12 9.5V6M12 18v-3.5M9.5 12H6M18 12h-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

export function mountApp(root: HTMLElement): void {
  const assignment = assignments[0];
  const saved = loadState(assignment.id);

  applyStudioTheme();

  let attempt = saved?.attempt ?? 0;
  let bestScore = saved?.bestScore ?? 0;
  let hasPassed = saved?.hasPassed ?? false;
  let totalXp = saved?.totalXp ?? 0;
  let badges = saved?.badges ?? [];
  let messages: ChatMessage[] = saved?.messages?.length ? saved.messages : [];
  let isEvaluating = false;
  let lastFeedbackXp: number | undefined;
  let lastQuestDone = questProgressFromEvaluation(
    [...messages].reverse().find((m) => m.evaluation)?.evaluation ?? null,
  );
  let newBadgeIds: string[] = [];

  root.innerHTML = `<div class="app" id="app">
    <header class="header">
      <div class="header__brand">
        <span class="header__logo" aria-hidden="true">${LOGO_SVG}</span>
        <div>
          <h1 class="header__title">Тренажёр промптов</h1>
          <p class="header__subtitle">Учимся формулировать задачи для ИИ</p>
        </div>
      </div>
      <div id="header-hud"></div>
    </header>
    <div class="main">
      <div class="studio-shell">
        <aside class="studio-rail" aria-label="Маршрут тренировки">
          <button type="button" class="studio-rail__node studio-rail__node--on" data-tooltip="Шаг 1: прочитайте блок «Контекст»" aria-label="Шаг 1: Контекст">1</button>
          <button type="button" class="studio-rail__node studio-rail__node--on" data-tooltip="Шаг 2: прочитайте блок «Цель»" aria-label="Шаг 2: Цель">2</button>
          <button type="button" class="studio-rail__node studio-rail__node--on" data-tooltip="Шаг 3: сверьтесь с чек-листом готовности" aria-label="Шаг 3: Чек-лист">3</button>
          <button type="button" class="studio-rail__node studio-rail__node--write" data-tooltip="Шаг 4: напишите промпт в терминале ниже" aria-label="Шаг 4: Промпт в терминале">✎</button>
        </aside>
        <div class="studio-shell__main">
          <section class="studio-shell__board" id="mission-root" aria-label="Доска задания"></section>
          <section class="studio-shell__terminal" id="studio-terminal" aria-label="Терминал проверки">
            <div class="studio-terminal__bar">
              <span class="studio-terminal__title">Терминал · проверка промпта</span>
              <div class="studio-terminal__actions">
                <button
                  type="button"
                  class="studio-terminal__fs-btn"
                  id="terminal-fullscreen-btn"
                  aria-label="Развернуть терминал на весь экран"
                  aria-pressed="false"
                  title="На весь экран"
                >
                  <svg class="studio-terminal__fs-icon studio-terminal__fs-icon--expand" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
                  <svg class="studio-terminal__fs-icon studio-terminal__fs-icon--collapse" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 14h6v6M14 4h6v6M4 10V4h6M14 20v-6h6"/></svg>
                </button>
                <span class="attempt-pill attempt-pill--none" id="attempt-label"></span>
              </div>
            </div>
            <div class="studio-terminal__body">
              <div id="chat-panel" class="chat-panel" data-layout="studio">
                <main class="chat" id="chat"><div class="chat__messages" id="messages"></div></main>
              </div>
              <div id="composer-root" class="composer-root" data-layout="studio">
                <footer class="footer">
                  <div class="composer">
                    <p class="composer__label"><span class="composer__label-dot" aria-hidden="true"></span> Ваш промпт для нейросети</p>
                    <div class="composer__inner">
                      <textarea class="composer__input" id="prompt-input" rows="1" aria-label="Ваш промпт"
                        placeholder="Опишите роль, данные и период, задачу по отчёту, тон и ограничения…"></textarea>
                      <button type="button" class="composer__send" id="send-btn" aria-label="Отправить промпт">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                      </button>
                    </div>
                    <p class="composer__hint">Enter — отправить · Shift+Enter — новая строка</p>
                  </div>
                </footer>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
    <div class="toast-xp" id="xp-toast" role="status" aria-live="polite"></div>
    <div class="pass-modal" id="pass-modal" hidden aria-hidden="true">
      <div class="pass-modal__backdrop" id="pass-modal-backdrop"></div>
      <div
        class="pass-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-modal-title"
        aria-describedby="pass-modal-desc"
      >
        <div class="pass-modal__badge" aria-hidden="true">✓</div>
        <h2 class="pass-modal__title" id="pass-modal-title">Задание зачтено!</h2>
        <p class="pass-modal__desc" id="pass-modal-desc">
          Вы набрали порог 75% и выполнили миссию. Хотите улучшить результат или вернуться к обучению на платформе?
        </p>
        <p class="pass-modal__score" id="pass-modal-score"></p>
        <div class="pass-modal__actions">
          <button type="button" class="pass-modal__btn pass-modal__btn--primary" id="pass-modal-improve">
            Повысить балл
          </button>
          <button type="button" class="pass-modal__btn pass-modal__btn--secondary" id="pass-modal-lms">
            Вернуться к обучению
          </button>
        </div>
      </div>
    </div>
    <div class="welcome-modal" id="welcome-modal" hidden aria-hidden="true">
      <div class="welcome-modal__backdrop" id="welcome-modal-backdrop" aria-hidden="true"></div>
      <div
        class="welcome-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
        aria-describedby="welcome-modal-desc"
      >
        <span class="welcome-modal__emoji" aria-hidden="true">👋</span>
        <h2 class="welcome-modal__title" id="welcome-modal-title">Добро пожаловать в тренажёр</h2>
        <p class="welcome-modal__intro" id="welcome-modal-desc">${assignment.intro}</p>
        <ol class="welcome-modal__steps">
          <li class="welcome-modal__step">
            <span class="welcome-modal__step-num">1</span>
            <span>На доске задания прочитайте блоки <strong>«Контекст»</strong> и <strong>«Цель»</strong> — от них зависит ваш промпт.</span>
          </li>
          <li class="welcome-modal__step">
            <span class="welcome-modal__step-num">2</span>
            <span>Посмотрите <strong>готовность промпта</strong> (чек-лист): по мере попыток пункты будут закрываться.</span>
          </li>
          <li class="welcome-modal__step">
            <span class="welcome-modal__step-num">3</span>
            <span>В <strong>терминале</strong> внизу напишите промпт и отправьте — тренажёр проверит структуру без вызова нейросети.</span>
          </li>
        </ol>
        <button type="button" class="welcome-modal__btn" id="welcome-modal-ok">
          Прочитал(а), к тренировке
        </button>
      </div>
    </div>
  </div>`;

  const messagesEl = root.querySelector("#messages") as HTMLElement;
  const chatEl = root.querySelector("#chat") as HTMLElement;
  const headerHud = root.querySelector("#header-hud") as HTMLElement;
  const missionRoot = root.querySelector("#mission-root") as HTMLElement;
  const studioTerminal = root.querySelector("#studio-terminal") as HTMLElement;
  const terminalFullscreenBtn = root.querySelector(
    "#terminal-fullscreen-btn",
  ) as HTMLButtonElement;
  const attemptLabel = root.querySelector("#attempt-label") as HTMLElement;
  const input = root.querySelector("#prompt-input") as HTMLTextAreaElement;
  const sendBtn = root.querySelector("#send-btn") as HTMLButtonElement;
  const xpToast = root.querySelector("#xp-toast") as HTMLElement;
  const passModal = root.querySelector("#pass-modal") as HTMLElement;
  const passModalScore = root.querySelector("#pass-modal-score") as HTMLElement;
  const passModalImprove = root.querySelector("#pass-modal-improve") as HTMLButtonElement;
  const passModalLms = root.querySelector("#pass-modal-lms") as HTMLButtonElement;
  const welcomeModal = root.querySelector("#welcome-modal") as HTMLElement;
  const welcomeModalOk = root.querySelector("#welcome-modal-ok") as HTMLButtonElement;
  const welcomeModalBackdrop = root.querySelector(
    "#welcome-modal-backdrop",
  ) as HTMLElement;
  function syncAttemptLabels(): void {
    const tier = attemptPillTier(attempt, messages, bestScore);
    const pct = lastEvaluationPercent(messages);
    let text = "Первая попытка — вперёд";
    if (attempt > 0) {
      text =
        pct != null
          ? `Попыток: ${attempt} · ${pct}%`
          : `Попыток: ${attempt}`;
    }
    attemptLabel.className = `attempt-pill attempt-pill--${tier}`;
    attemptLabel.textContent = text;
  }

  function focusTerminal(): void {
    scrollChat();
    if (isMobileLayout()) {
      studioTerminal.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function isTerminalExpanded(): boolean {
    return (
      document.fullscreenElement === studioTerminal ||
      studioTerminal.classList.contains("studio-shell__terminal--expanded")
    );
  }

  function syncTerminalFullscreenUi(): void {
    const on = isTerminalExpanded();
    terminalFullscreenBtn.setAttribute("aria-pressed", on ? "true" : "false");
    terminalFullscreenBtn.setAttribute(
      "aria-label",
      on ? "Свернуть терминал" : "Развернуть терминал на весь экран",
    );
    terminalFullscreenBtn.title = on ? "Свернуть" : "На весь экран";
    studioTerminal.classList.toggle("studio-shell__terminal--expanded", on);
  }

  async function toggleTerminalFullscreen(): Promise<void> {
    try {
      if (isTerminalExpanded()) {
        if (document.fullscreenElement === studioTerminal) {
          await document.exitFullscreen();
        } else {
          studioTerminal.classList.remove("studio-shell__terminal--expanded");
        }
      } else if (studioTerminal.requestFullscreen) {
        await studioTerminal.requestFullscreen();
      } else {
        studioTerminal.classList.add("studio-shell__terminal--expanded");
      }
    } catch {
      studioTerminal.classList.toggle("studio-shell__terminal--expanded");
    }
    syncTerminalFullscreenUi();
  }

  terminalFullscreenBtn.addEventListener("click", () => {
    void toggleTerminalFullscreen();
  });
  document.addEventListener("fullscreenchange", () => syncTerminalFullscreenUi());

  function openWelcomeModal(): void {
    welcomeModal.hidden = false;
    welcomeModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    welcomeModalOk.focus();
  }

  function closeWelcomeModal(): void {
    welcomeModal.hidden = true;
    welcomeModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    markWelcomeSeen();
  }

  welcomeModalOk.addEventListener("click", () => closeWelcomeModal());
  welcomeModalBackdrop.addEventListener("click", () => closeWelcomeModal());

  function maybeShowWelcome(): void {
    if (hasSeenWelcome()) return;
    window.setTimeout(() => openWelcomeModal(), 400);
  }

  function openPassModal(score: number): void {
    passModalScore.textContent = `Ваш результат: ${score}% · рекорд сохранён в тренажёре`;
    passModal.hidden = false;
    passModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    passModalImprove.focus();
  }

  function closePassModal(): void {
    passModal.hidden = true;
    passModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    input.focus();
  }

  passModalImprove.addEventListener("click", () => closePassModal());
  passModalLms.addEventListener("click", () => {
    window.location.href = LMS_URL;
  });

  function persist(): void {
    const state: PersistedState = {
      version: 2,
      assignmentId: assignment.id,
      attempt,
      bestScore,
      hasPassed,
      messages,
      totalXp,
      badges,
    };
    saveState(state);
  }

  function isMobileLayout(): boolean {
    return window.matchMedia("(max-width: 860px)").matches;
  }

  function renderMission(): void {
    missionRoot.innerHTML = missionBoardHtml(assignment, lastQuestDone);
  }

  function renderHeader(): void {
    headerHud.innerHTML = headerHudHtml(
      levelFromXp(totalXp),
      bestScore,
      hasPassed,
      badges,
      newBadgeIds,
    );
    syncAttemptLabels();
  }

  function scrollChat(): void {
    requestAnimationFrame(() => {
      chatEl.scrollTop = chatEl.scrollHeight;
    });
  }

  function renderMessages(): void {
    if (!messages.length && !isEvaluating) {
      messagesEl.innerHTML = `<div class="chat-empty">
        <div class="chat-empty__icon">💬</div>
        <p>Напишите промпт в поле ниже — как будто отправляете его в <strong>чат с нейросетью</strong>, чтобы получить черновик отчёта по данным для руководства.</p>
      </div>`;
    } else {
      messagesEl.innerHTML = messages
        .map((m, i) => {
          const isLastFeedback =
            i === messages.length - 1 && m.role === "assistant" && m.evaluation;
          return messageHtml(m, isLastFeedback ? lastFeedbackXp : undefined);
        })
        .join("");
    }
    if (isEvaluating) {
      messagesEl.insertAdjacentHTML(
        "beforeend",
        `<div class="message message--assistant">
          <div class="message__avatar">AI</div>
          <div class="message__body"><div class="message__bubble"><div class="typing"><span></span><span></span><span></span></div></div></div>
        </div>`,
      );
    }
    scrollChat();
  }

  function showXpToast(amount: number, extra?: string): void {
    xpToast.textContent = extra ? `+${amount} XP · ${extra}` : `+${amount} XP`;
    xpToast.classList.add("toast-xp--show");
    window.setTimeout(() => xpToast.classList.remove("toast-xp--show"), 2400);
  }

  function triggerCelebrate(): void {
    document.body.classList.add("celebrate");
    window.setTimeout(() => document.body.classList.remove("celebrate"), 900);
  }

  function resizeInput(): void {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
  }

  function setComposerEnabled(on: boolean): void {
    input.disabled = !on;
    sendBtn.disabled = !on || !input.value.trim();
  }

  function submit(): void {
    const text = input.value.trim();
    if (!text || isEvaluating) return;

    const prevPassed = hasPassed;
    const prevBest = bestScore;
    const prevBadges = [...badges];

    attempt += 1;
    isEvaluating = true;
    lastFeedbackXp = undefined;
    newBadgeIds = [];
    input.value = "";
    resizeInput();
    setComposerEnabled(false);

    messages.push({
      id: uid(),
      role: "user",
      content: text,
      attempt,
    });
    renderMessages();
    renderHeader();
    persist();
    focusTerminal();

    const delay = 600 + Math.min(text.length * 8, 1200);
    window.setTimeout(() => {
      const evaluation = evaluatePrompt(text, assignment);
      const isNewBest = evaluation.percent > prevBest;
      bestScore = Math.max(bestScore, evaluation.percent);
      const justPassed = evaluation.isPassed && !prevPassed;
      if (evaluation.isPassed) hasPassed = true;

      const gainedXp = xpFromAttempt(evaluation.percent, {
        isNewBest,
        justPassed,
        isExcellent: evaluation.isExcellent,
      });
      totalXp += gainedXp;
      lastFeedbackXp = gainedXp;

      badges = computeNewBadges({
        badges,
        attempt,
        percent: evaluation.percent,
        isPassed: evaluation.isPassed,
        isExcellent: evaluation.isExcellent,
        justPassed,
      });
      newBadgeIds = badgesEarned(prevBadges, badges);

      lastQuestDone = questProgressFromEvaluation(evaluation);

      messages.push({
        id: uid(),
        role: "assistant",
        content: formatEvaluationMessage(evaluation),
        evaluation,
      });
      isEvaluating = false;
      renderMission();
      renderHeader();
      renderMessages();
      setComposerEnabled(true);
      persist();

      showXpToast(
        gainedXp,
        newBadgeIds.length
          ? BADGE_DEFS[newBadgeIds[0]]?.title
          : justPassed
            ? "Зачёт!"
            : undefined,
      );
      if (justPassed || evaluation.isExcellent) {
        triggerCelebrate();
      }
      if (justPassed) {
        window.setTimeout(() => openPassModal(bestScore), 400);
      } else {
        input.focus();
      }
    }, delay);
  }

  sendBtn.addEventListener("click", submit);
  input.addEventListener("input", () => {
    resizeInput();
    sendBtn.disabled = isEvaluating || !input.value.trim();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  renderMission();
  renderHeader();
  renderMessages();
  setComposerEnabled(true);
  maybeShowWelcome();
}
