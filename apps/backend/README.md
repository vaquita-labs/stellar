# vaquina (backend)

Legacy backend based on Express 4 + AWS Lambda + MongoDB. Uses `yarn` (not pnpm) and keeps its own toolchain.

> Newer apps live in `@vaquita/api`, `@vaquita/listener`, and `@vaquita/job-deposits`. This package is still active for existing integrations.

## Run in development

Inside `apps/backend`:

```bash
yarn install
yarn dev      # kills port 3005, ts-node-dev with watch
```

Server at `http://localhost:3005`.

## Scripts

| Script | Description |
|--------|-------------|
| `yarn dev` | Hot reload with `ts-node-dev` |
| `yarn start` | Production with `ts-node` |
| `yarn build` | `tsc` + `tsc-alias` |
| `yarn mig` | Runs migrations (`src/migrations/index.ts`) |
| `yarn sed` | Runs seeders (`src/seeders/index.ts`) |
| `yarn build:api-service` | Build + bump patch + deploy script |
| `yarn lambdas:update-apps` | Build + push + update lambdas |
| `yarn check-circular-dependencies` | `madge` to detect cycles |

## Stack

- Express 4 + `lambda-api` (Lambda deployment)
- Official MongoDB driver
- AWS SDK v3 (S3, SQS, ECS, EC2, API Gateway WS)
- Validation: `class-validator` + `class-transformer`
- Hashing: `argon2`

## Layout

```
src/
├── app.ts                      # server entry
├── app-api-express-lambda.ts   # Lambda entry
├── app/
├── config/
├── helpers/
├── middlewares/
├── migrations/
├── seeders/
├── services/
├── types/
└── validations/
```
