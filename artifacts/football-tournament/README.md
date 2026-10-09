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
- `ADMIN_SETUP_TOKEN` — one-time token for the first administrator setup

Optional environment variable: `MONGODB_DATABASE`.

The Atlas network access list must allow the app runtime to connect. The API fails explicitly rather than switching to temporary/local storage when MongoDB is unreachable.

## First administrator

Open `/admin/login` while the database is connected. The first-use form accepts `ADMIN_SETUP_TOKEN`, an email address, and a password of at least 12 characters. The token is accepted only until the first administrator is created. Later visits show the regular sign-in form.

Administrator passwords are bcrypt-hashed. Sessions are stored in MongoDB and use HTTP-only, same-site cookies.

## Main functionality

- Create and edit tournaments with independent team rosters, formats, stages, and match records.
- Register teams up to the tournament's configured capacity.
- Create stages, generate single or double round-robin fixtures, and schedule kickoff times and venues.
- Start live matches, change scores and minutes, add goal/card/substitution events, and record full-time results.
- Calculate league standings from completed matches; corrections to old scores are reflected in the table.
- Complete stages with chosen qualifiers and seed the next knockout stage when its order is configured.
- Show public tournament, standings, fixture, result, live, teams, bracket, and match-centre pages.
- Broadcast match/stage updates over Socket.IO and refresh clients without requiring a page reload.

Team and tournament crests currently accept image URLs. Direct image-file uploads require a persistent object-storage configuration compatible with the app's MongoDB and administrator-authentication requirements.

## API

The OpenAPI contract is `lib/api-spec/openapi.yaml`. Regenerate the typed client and Zod schemas after changing it:

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

The app's full service and deployment setup is managed by Replit artifacts and workflows.
