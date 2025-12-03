# Repository Guidelines

## Project Structure & Modules
- `src/`: NestJS modules (`auth`, `users`, `reports`, `google`, `mail`, `openai`, `email-analysis`, shared `guards`/`interceptors`) plus `app.module.ts` wiring TypeORM, ConfigModule, Schedule, and static files from `public/`.
- `public/`: served assets via `ServeStaticModule`.
- `test/`: Jest e2e specs and `jest-e2e.json`; additional unit specs live alongside code under `src/`.
- `dist/`: build output created by `npm run build`.

## Build, Test, and Development Commands
- `npm run start:dev`: start local server with watch reload.
- `npm run start`: run once; use `npm run start:prod` after building for production.
- `npm run build`: emit compiled JS to `dist/`.
- `npm run test` | `npm run test:e2e`: run unit or e2e suites; add `:watch` or `:cov` for watch/coverage.
- `npm run lint`: ESLint TypeScript rules + Prettier; auto-fix enabled.
- `npm run format`: Prettier formatting for `src/` and `test/`.

## Coding Style & Naming
- TypeScript with ESLint recommended + type-checked presets; `@typescript-eslint/no-explicit-any` is off but prefer typed APIs.
- Prettier: single quotes, trailing commas, auto EOL handling; 2-space Nest defaults.
- Use PascalCase for classes/providers, camelCase for variables/functions, kebab-case for files unless Nest schematic uses suffixes (e.g., `users.service.ts`).
- Keep modules cohesive: controllers/services/entities per feature folder.

## Testing Guidelines
- Framework: Jest + `@nestjs/testing`; e2e uses Supertest config in `test/jest-e2e.json`.
- Name unit specs `*.spec.ts` near code; e2e in `test/` as `*.e2e-spec.ts`.
- For new features, include happy-path and failure-case tests; run `npm run test` and `npm run test:e2e` before PRs. Aim to maintain coverage reported by `npm run test:cov`.

## Commit & Pull Request Guidelines
- Git history follows Conventional Commit style (`feat: ...`, `fix: ...`), sometimes scoped; use imperative, concise summaries.
- Branch/PR: describe change, link issues, and note breaking changes or migrations. Add screenshots for UI/API examples where applicable and list test commands executed.

## Security & Configuration Tips
- Copy `env.example` to `.env` (or `.env.development`) and set DB/Google/OpenAI credentials; ConfigModule is global.
- Default DB config targets Postgres with entities auto-synced when `NODE_ENV` is not `production`. Avoid using auto-sync against production schemas.
- Static files served from `public/`; avoid committing secrets or generated assets there.
