# Football Tournament Manager

A public football tournament site and administrator dashboard for managing competitions, teams, stages, fixtures, live scores, results, standings, and knockout progression.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the Express API server (port 5000)
- `pnpm --filter @workspace/football-tournament run dev` — run the public and admin web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required secrets: `MONGODB_URI`, `SESSION_SECRET`, and `ADMIN_SETUP_TOKEN`
- Optional env: `MONGODB_DATABASE`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: MongoDB Atlas + Mongoose (tournament data and administrator sessions)
- Realtime: Socket.IO
- Auth: bcryptjs password hashes, server-side MongoDB sessions, HTTP-only cookies
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Public and administrator UI: `artifacts/football-tournament/src/App.tsx`
- API routes and OpenAPI contract: `artifacts/api-server/src/routes/`, `lib/api-spec/openapi.yaml`
- Mongo models and connection: `artifacts/api-server/src/lib/mongo.ts`
- Initial administrator setup and session endpoints: `artifacts/api-server/src/routes/auth.ts`
- Generated client and validation schemas: `lib/api-client-react/`, `lib/api-zod/`
- Setup and deployment notes: `artifacts/football-tournament/README.md`

## Architecture decisions

- Tournament records are isolated by `tournamentId`; standings are recalculated from completed fixtures instead of storing derived table rows.
- The first administrator is created once with `ADMIN_SETUP_TOKEN`; subsequent account creation is closed.
- Live match events are broadcast via Socket.IO; the API service route includes `/socket.io` for the proxy.

## Product

Public routes cover tournament overview, standings, fixtures, results, live matches, teams, brackets, and match details. Admin routes cover secure sign-in, tournament/team/stage management, round-robin fixture generation, scheduling, score and event updates, and stage qualification.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- MongoDB Atlas must permit connections from the running environment; the API intentionally fails to start when it cannot connect.
- Regenerate API hooks after editing `lib/api-spec/openapi.yaml`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
