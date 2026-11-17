# Football Tournament Manager

Public competition pages and an administrator console backed by MongoDB Atlas.

## Run

Start the API and web services with their managed Replit workflows, or run:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/football-tournament run dev
```

The API requires these Replit secrets:

- `MONGODB_URI` — MongoDB Atlas connection string
- `SESSION_SECRET` — secret used to sign administrator session cookies
- `ADMIN_USERNAME` — administrator username used for sign-in
- `ADMIN_PASSWORD` — administrator password used for sign-in

Optional environment variable: `MONGODB_DATABASE`.

The Atlas network access list must allow the app runtime to connect. The API fails explicitly rather than switching to temporary/local storage when MongoDB is unreachable.

## Administrator sign-in

Open `/?admin=nutterx` to reach the hidden sign-in form. Set the administrator username and password as API environment secrets; the application compares sign-in attempts against those values and does not store the password in MongoDB. Use a password of at least 12 characters.

Successful sign-ins use MongoDB-backed sessions and HTTP-only, same-site cookies. Rotating either credential invalidates existing administrator sessions.

## Main functionality

- Create tournaments as a league, knockout bracket, or 20-team group-to-knockout competition.
- Register teams up to the tournament's configured capacity. A 20-team group competition assigns four balanced groups when no group is supplied.
- Generate the full league or group round-robin automatically when registration closes, with kickoff slots assigned automatically.
- Build the 20-team pathway automatically: group stage, positions 5–12 playoffs, quarter-finals, semi-finals, and final. Positions 1–4 receive quarter-final byes; positions 13–20 are eliminated.
- Build knockout brackets and later rounds automatically. Match winners advance from scores; an administrator selects a winner only when a knockout match is tied.
- Start live matches, change scores and minutes, add goal/card/substitution events, and record full-time results.
- Calculate standings from completed matches; group competitions show a separate table for each group and fixtures stay within their group.
- Schedule generated fixtures for 15:00 East Africa Time on the next Saturday, with kickoff slots staggered automatically. Scores, status, and events remain editable by the administrator.
- Show public tournament, standings, fixture, result, live, teams, bracket, and match-centre pages.
- Use group sub-navigation to switch between standings and fixture lists without duplicating pages.
- Broadcast changes over Socket.IO in development; Vercel deployments refresh through short-interval polling so serverless instances do not need shared in-memory sockets.

Team and tournament crests currently accept image URLs. Direct image-file uploads require a persistent object-storage configuration compatible with the app's MongoDB and administrator-authentication requirements.

## API

The OpenAPI contract is `lib/api-spec/openapi.yaml`. Regenerate the typed client and Zod schemas after changing it:

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

## Deploy to Vercel

Deploy the web app and API as two Vercel projects from the same repository:

1. Create the API project with root directory `artifacts/api-server`. Vercel detects the Express app in `src/index.ts`.
2. Add `MONGODB_URI`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `WEB_ORIGIN` to the API project's environment variables. `WEB_ORIGIN` is the exact HTTPS origin of the web project, without a trailing slash.
3. Create the web project with root directory `artifacts/football-tournament`. The included `vercel.json` builds the Vite app and enables client-side route fallback.
4. Set `VITE_API_BASE_URL` in the web project to the API project's HTTPS origin, then deploy the web project. Add that deployed web origin as `WEB_ORIGIN` in the API project and redeploy the API.

For Vercel preview deployments, configure matching preview origins in the API project's Preview environment. The browser includes the session cookie on API requests.

The API is a serverless Express function on Vercel, while MongoDB stores tournament data and sessions. Development on Replit continues to use Socket.IO. Vercel production uses five-second data refreshes to keep live scores current across separate serverless instances.
