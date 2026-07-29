# URL Checker

URL Checker — приложение для асинхронной проверки доступности списка HTTP- и HTTPS-адресов.

Пользователь создаёт задание из одного или нескольких URL. Backend сохраняет его в памяти, проверяет адреса с помощью HTTP `HEAD`, а frontend показывает состояние задания, статистику и результаты отдельных проверок. Обновления поступают через polling.

## Возможности

- создание задания из списка URL;
- одновременная обработка нескольких адресов;
- просмотр списка заданий;
- просмотр прогресса и результатов каждого URL;
- отображение HTTP status, ошибки, времени начала и продолжительности проверки;
- автоматическое обновление активного задания через polling;
- отмена задания;
- обработка сетевых ошибок, timeout и ошибок API;
- защита frontend от устаревших list/details responses;
- production-like запуск через Docker Compose.

## Технологии

### Backend

- Node.js;
- NestJS;
- TypeScript;
- class-validator;
- встроенный Fetch API;
- in-memory repository.

### Frontend

- React 19;
- Redux Toolkit;
- React Redux;
- TypeScript;
- Vite.

### Тестирование

- Vitest;
- Supertest;
- React Testing Library;
- jsdom;
- jest-dom.

### Инфраструктура

- Docker;
- Docker Compose;
- multi-stage Docker builds;
- nginx 1.28 для раздачи frontend и reverse proxy;
- Node.js 24 Alpine в Docker.

## Архитектура

Основной поток данных:

1. Пользователь вводит URL и отправляет форму.
2. Frontend вызывает `POST /api/jobs`.
3. Backend валидирует запрос и создаёт задание со статусом `pending`.
4. Задание сохраняется в `JobsRepository`.
5. Фоновый `JobsProcessor` переводит задание в `in_progress`.
6. Processor выполняет HTTP `HEAD` для URL с ограниченной параллельностью.
7. Результаты и статистика обновляются в памяти.
8. Frontend периодически получает details активного задания.
9. Polling прекращается после terminal status.

Хранилище, processor и REST API работают в одном backend-процессе. Внешняя очередь, Redis и база данных не используются.

## Структура проекта

```text
url-checker/
├── backend/
│   ├── src/
│   │   ├── config/             # Runtime-конфигурация и validation env
│   │   └── jobs/               # API, service, repository и processor
│   ├── test/                   # Backend e2e-тесты
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/                # Root component и Redux store
│   │   ├── features/jobs/      # UI, API, Redux model и polling hook
│   │   ├── shared/             # Общий API client и UI
│   │   └── test/               # Общий test setup
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .dockerignore
│   ├── .env.example
│   └── package.json
├── compose.yml
└── README.md
```

## Требования

### Для Docker-запуска

- Docker;
- Docker Compose v2.

### Для локального запуска

- Node.js, совместимый с проектом;
- npm.

## Быстрый старт

### Локально

1. Подготовить frontend environment:

   ```bash
   Copy-Item frontend/.env.example frontend/.env
   ```

2. Установить зависимости backend:

   ```bash
   cd backend
   npm ci
   ```

3. Запустить backend в первом терминале:

   ```bash
   npm run start:dev
   ```

4. Установить зависимости frontend во втором терминале:

   ```bash
   cd frontend
   npm ci
   ```

5. Запустить frontend:

   ```bash
   npm run dev
   ```

6. Открыть приложение:

   ```text
   http://localhost:5173
   ```

### Через Docker

1. Перейти в корень проекта.

2. Собрать и запустить контейнеры:

   ```bash
   docker compose up --detach --build --wait --wait-timeout 60
   ```

3. Проверить состояние:

   ```bash
   docker compose ps
   ```

4. Открыть приложение:

   ```text
   http://localhost:8080
   ```

5. Остановить приложение:

   ```bash
   docker compose down
   ```

## Чистая Docker-сборка

Полная проверка без Docker build cache:

```bash
docker compose down --volumes --remove-orphans
docker compose build --no-cache --pull --progress plain
docker compose up --detach --wait --wait-timeout 60
docker compose ps
```

Smoke-check:

```bash
curl --fail http://localhost:8080/
curl --fail http://localhost:8080/api/jobs
```

Завершение:

```bash
docker compose down --volumes --remove-orphans
```

`.dockerignore` исключает локальные:

- `node_modules`;
- `dist`;
- coverage;
- тестовые файлы;
- `.env`;
- логи и временные файлы.

Поэтому Docker build устанавливает зависимости через `npm ci` и не использует локальные dependencies или ранее созданный build output.

## Локальный запуск без Docker

Backend и frontend запускаются в разных терминалах.

### Backend

Перейти в каталог:

```bash
cd backend
```

Установить зависимости:

```bash
npm ci
```

Backend имеет значения конфигурации по умолчанию, поэтому `.env` не обязателен. Для явной настройки можно скопировать example:

```bash
cp .env.example .env
```

В bash:

```bash
Copy-Item .env.example .env
```

Запустить development mode:

```bash
npm run start:dev
```

Backend будет доступен по адресу:

```text
http://localhost:3000
```

Проверка:

```bash
curl --fail http://localhost:3000/
```

Production build:

```bash
npm run build
```

Production start после build:

```bash
npm run start:prod
```

### Frontend

В другом терминале:

```bash
cd frontend
```

Установить зависимости:

```bash
npm ci
```

Создать локальный `.env`:

```bash
cp .env.example .env
```

В bash:

```bash
Copy-Item .env.example .env
```

Пример содержит:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
```

Запустить Vite:

```bash
npm run dev
```

Frontend будет доступен по адресу:

```text
http://localhost:5173
```

Backend по умолчанию разрешает CORS для этого origin.

Frontend production build:

```bash
npm run build
```

Просмотр локального build:

```bash
npm run preview
```

Vite preview предназначен для проверки build. В Docker production-like режиме frontend обслуживает nginx.

## API

### Root endpoint

```http
GET /
```

Успешный ответ:

```text
Hello World!
```

Endpoint используется backend healthcheck и не изменяет jobs.

### Создание задания

```http
POST /api/jobs
Content-Type: application/json
```

Запрос:

```json
{
  "urls": ["https://example.com", "https://example.org"]
}
```

Успешный статус:

```text
201 Created
```

Ответ:

```json
{
  "jobId": "f29c119f-fc6d-4e56-a234-a66d876fe753"
}
```

Основная ошибка:

```text
400 Bad Request
```

### Список заданий

```http
GET /api/jobs
```

Успешный статус:

```text
200 OK
```

Сокращённый пример:

```json
[
  {
    "id": "f29c119f-fc6d-4e56-a234-a66d876fe753",
    "createdAt": "2026-01-01T10:00:00.000Z",
    "status": "in_progress",
    "statistics": {
      "total": 2,
      "pending": 0,
      "inProgress": 2,
      "success": 0,
      "error": 0,
      "cancelled": 0,
      "processed": 0
    }
  }
]
```

Jobs сортируются по `createdAt`: новые задания находятся в начале списка.

### Details задания

```http
GET /api/jobs/:id
```

Успешный статус:

```text
200 OK
```

Сокращённый пример terminal result:

```json
{
  "id": "f29c119f-fc6d-4e56-a234-a66d876fe753",
  "createdAt": "2026-01-01T10:00:00.000Z",
  "startedAt": "2026-01-01T10:00:01.000Z",
  "finishedAt": "2026-01-01T10:00:03.000Z",
  "status": "completed",
  "statistics": {
    "total": 2,
    "pending": 0,
    "inProgress": 0,
    "success": 1,
    "error": 1,
    "cancelled": 0,
    "processed": 2
  },
  "items": [
    {
      "id": "f4b1b348-e092-46db-aa51-fc7083791809",
      "url": "https://example.com",
      "status": "success",
      "httpStatus": 200,
      "errorMessage": null,
      "startedAt": "2026-01-01T10:00:01.000Z",
      "finishedAt": "2026-01-01T10:00:02.000Z",
      "durationMs": 1000
    },
    {
      "id": "6dd244d8-dd6e-4bc6-a70d-477a6c5b58cd",
      "url": "https://example.org",
      "status": "error",
      "httpStatus": null,
      "errorMessage": "HTTP request failed",
      "startedAt": "2026-01-01T10:00:01.000Z",
      "finishedAt": "2026-01-01T10:00:03.000Z",
      "durationMs": 2000
    }
  ],
  "failureMessage": null
}
```

Неизвестный ID возвращает:

```text
404 Not Found
```

### Отмена задания

```http
DELETE /api/jobs/:id
```

Успешный статус:

```text
204 No Content
```

Этот endpoint отменяет обработку, но не удаляет job из repository и списка.

Возможные ошибки:

- `404 Not Found` — job не существует;
- `409 Conflict` — job уже находится в `completed` или `failed`.

Повторная отмена уже отменённой job является идемпотентной и возвращает `204`.

Отдельные endpoints для progress, cancel через `POST` или физического удаления job отсутствуют.

## Валидация URL

Поле `urls`:

- обязательно;
- должно быть массивом;
- должно содержать от 1 до 100 элементов;
- каждый элемент должен быть строкой;
- каждый URL должен содержать явный протокол `http://` или `https://`;
- другие протоколы не поддерживаются.

Корректный пример:

```json
{
  "urls": ["https://example.com", "http://example.org/path"]
}
```

Некорректные примеры:

```json
{}
```

```json
{
  "urls": []
}
```

```json
{
  "urls": ["example.com"]
}
```

```json
{
  "urls": ["ftp://example.com"]
}
```

Frontend перед отправкой:

- разбивает textarea по строкам;
- удаляет пробелы по краям;
- игнорирует пустые строки;
- выполняет базовую проверку HTTP/HTTPS URL.

Backend всегда повторно валидирует запрос независимо от frontend.

## Жизненный цикл задания

Job может иметь один из статусов:

```text
pending
in_progress
completed
cancelled
failed
```

Основной переход:

```text
pending → in_progress → completed
```

Альтернативные terminal statuses:

```text
cancelled
failed
```

- `pending` устанавливается при создании.
- `in_progress` устанавливается при начале processor workflow.
- `completed` означает, что все items получили terminal status.
- `cancelled` устанавливается после запроса отмены.
- `failed` означает внутренний сбой workflow всей job.

Ошибка отдельного URL не переводит job в `failed`. Такая job может завершиться как `completed`, имея одновременно успешные и ошибочные items.

Terminal job со статусом `completed` или `failed` отменить нельзя.

### Статусы URL

Каждый URL item может иметь статус:

```text
pending
in_progress
success
error
cancelled
```

## Обработка URL

Для каждого URL backend выполняет:

```text
HTTP HEAD
```

Настройки запроса:

- redirects обрабатываются в режиме `follow`;
- timeout по умолчанию — 5000 мс;
- максимум параллельных проверок одной job по умолчанию — 5;
- после HEAD применяется искусственная задержка от 0 до 10000 мс;
- автоматический retry HEAD-запроса отсутствует.

Если сервер вернул HTTP response, item получает:

```text
status = success
httpStatus = фактический status code
```

`success` в этой модели означает, что HTTP response был получен. Он не означает обязательный HTTP `2xx`. Например, response `404` сохраняется как:

```text
status = success
httpStatus = 404
```

При network, TLS или timeout error item получает:

```text
status = error
httpStatus = null
errorMessage = безопасное сообщение
```

Для item сохраняются:

- время начала;
- время завершения;
- продолжительность в миллисекундах;
- HTTP status или сообщение об ошибке.

## Отмена

При отмене:

1. job получает статус `cancelled`;
2. ещё не начатые items становятся `cancelled`;
3. новые HEAD-запросы для этой job больше не запускаются;
4. уже запущенные HEAD-запросы физически не прерываются;
5. результаты уже запущенных запросов сохраняются;
6. после их завершения job получает окончательный `finishedAt`;
7. job не возвращается в `completed`.

Если активных items нет, `finishedAt` устанавливается непосредственно при отмене.

## Polling frontend

После выбора job frontend немедленно запрашивает:

```http
GET /api/jobs/:id
```

Если status равен `pending` или `in_progress`, следующий запрос планируется через 1000 мс после завершения текущего.

Особенности:

- параллельные polling loops для одной активной job не создаются;
- после временной ошибки details-запрос повторяется через интервал;
- при смене active job предыдущий запрос abort-ится;
- polling прекращается при unmount;
- polling прекращается для `completed`, `cancelled` и `failed`;
- stale list/details responses проверяются по request ID и active job ID.

Polling retry относится только к загрузке details frontend. Backend не повторяет неудавшийся HTTP HEAD автоматически.

## Скрипты и проверки

### Backend

Рабочий каталог:

```bash
cd backend
```

| Команда              | Назначение                               |
| -------------------- | ---------------------------------------- |
| `npm run start:dev`  | Development server с watch               |
| `npm run build`      | NestJS production build                  |
| `npm run start:prod` | Запуск предварительно собранного backend |
| `npm test`           | Backend unit-тесты                       |
| `npm run test:e2e`   | Backend e2e-тесты                        |
| `npm run test:watch` | Unit-тесты в watch mode                  |
| `npm run lint`       | ESLint с автоматическим исправлением     |
| `npm run format`     | Prettier для backend и тестов            |

Команда backend lint содержит `--fix` и может изменять файлы.

### Frontend

Рабочий каталог:

```bash
cd frontend
```

| Команда              | Назначение                         |
| -------------------- | ---------------------------------- |
| `npm run dev`        | Vite development server            |
| `npm run build`      | TypeScript и Vite production build |
| `npm run preview`    | Локальный просмотр build           |
| `npm test`           | Frontend-тесты                     |
| `npm run test:watch` | Тесты в watch mode                 |
| `npm run lint`       | Oxlint                             |

## Тестирование

### Backend

Unit-тесты покрывают:

- JobsService;
- JobsProcessor;
- HttpClientService;
- JobsController;
- concurrency;
- mixed success/error;
- cancellation;
- job-level failure;
- stale/late results;
- statistics.

Запуск:

```bash
cd backend
npm test
```

E2e-тесты запускают настоящее NestJS application и проверяют:

- HTTP routing;
- global validation;
- создание и получение job;
- полное завершение;
- cancellation через HTTP;
- неизвестные IDs;
- ошибки входных данных.

Запуск:

```bash
cd backend
npm run test:e2e
```

### Frontend

Frontend-тесты покрывают:

- API paths, methods и request options;
- обработку backend и network errors;
- stale list/details responses;
- синхронизацию summary и details;
- polling lifecycle;
- terminal statuses;
- retry после временной ошибки;
- cleanup и abort;
- polling → Redux → UI integration flow.

Запуск:

```bash
cd frontend
npm test
```

## Ограничения текущей реализации

- Jobs хранятся только в памяти.
- После перезапуска backend все задания теряются.
- Processor работает внутри backend-процесса.
- Внешняя очередь задач отсутствует.
- Горизонтальное масштабирование backend не поддерживает общее состояние jobs.
- База данных отсутствует.
- Authentication и authorization отсутствуют.
- Rate limiting отсутствует.
- Job нельзя физически удалить через API.
- Уже запущенный HEAD не прерывается при отмене.
- HEAD-запросы не повторяются автоматически.
- `VITE_API_BASE_URL` нельзя изменить без пересборки frontend.
- Swagger/OpenAPI не реализован.
- История и результаты не сохраняются между запусками.
