# Тренажёр промптов · отчёт по данным

Статическое веб-приложение: проверка промптов без бэкенда и без вызовов LLM. Прогресс хранится в **localStorage** браузера.

## GitHub Pages

Сайт: **https://learn-iad.github.io/AI-3/** (после включения Pages и push в `main`).

1. Репозиторий → **Settings** → **Pages** → Source: **GitHub Actions**.
2. Push в ветку `main` — workflow `.github/workflows/deploy-pages.yml` соберёт и выложит папку `dist`.

На Pages попадает только сборка (HTML + JS + CSS). Папка `node_modules` и исходники на хостинг **не** загружаются.

### Пустая страница / «ничего не работает»

Если в исходном коде страницы видно `<script … src="/src/main.ts">` — GitHub отдаёт **файлы из ветки**, а не результат `npm run build`. Браузер не умеет запускать TypeScript с Pages, поэтому экран пустой.

**Что сделать:**

1. **Settings → Pages → Build and deployment → Source** — выберите **GitHub Actions**, не «Deploy from a branch».
2. **Actions → Deploy to GitHub Pages** → откройте последний запуск на `main` → **Re-run all jobs** (или сделайте push в `main`).
3. Успешный деплой: в HTML должны быть пути вида `/AI-3/assets/index-….js`, не `/src/main.ts`.

Workflow `Deploy to GitHub Pages` должен быть **зелёным**. Если шаг `deploy-pages` падает, чаще всего Pages ещё не переключили на GitHub Actions (п. 1).

### Размер

Типичная сборка — порядка **15–25 KB** JS (gzip) и **5 KB** CSS. Для GitHub Pages это очень лёгкий проект; лимиты Pages рассчитаны на сайты на мегабайты.

Зависимости в `package.json` — только **dev** (TypeScript и Vite для сборки). В браузере пользователя — чистый JavaScript без React и без CDN.

## Локальная разработка

```bash
npm install
npm run dev
```

Для локального dev базовый путь `/AI-3/` совпадает с Pages. Открывайте URL из терминала Vite (не корень `localhost`, а путь с `/AI-3/`).

```bash
npm run build    # результат в dist/
npm run preview  # проверка сборки
```

## Зачёт

Порог **75%** — в шапке появляется «Зачёт ✓». Ниже порога тренажёр просит доработать промпт. При 75%+ всё равно даётся обратная связь и предложение довести до **92+** (идеал).

## Проверка оценщика

```bash
npm test
```

## Задания

`src/data/assignments.ts` — тексты заданий.  
`src/lib/evaluatePrompt.ts` — критерии и эвристики для русского языка.
