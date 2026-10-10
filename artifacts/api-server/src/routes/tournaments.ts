import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  CompleteStageBody,
  CompleteStageParams,
  CreateMatchBody,
  CreateMatchEventBody,
  CreateStageBody,
  CreateTeamBody,
  CreateTournamentBody,
  DeleteMatchParams,
  DeleteTeamParams,
  GenerateFixturesBody,
  GetStandingsQueryParams,
  GetTournamentParams,
  ListMatchEventsQueryParams,
  ListMatchesQueryParams,
  ListStagesQueryParams,
  ListTeamsQueryParams,
  CreateMatchEventResponse,
  UpdateMatchBody,
  UpdateMatchParams,
  UpdateTeamBody,
  UpdateTeamParams,
  UpdateTournamentBody,
  UpdateTournamentParams,
} from "@workspace/api-zod";
import { Match, Stage, Team, Tournament, toMatch, toPlain } from "../lib/mongo";
import { calculateStandings } from "../lib/standings";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.adminId) {
    res.status(401).json({ error: "Administrator sign-in required." });
    return;
  }
  next();
}

function idParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value ?? "");
}

function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tournament";
}

function broadcast(req: Request, event: string, payload: unknown): void {
  const io = req.app.get("io") as { emit: (name: string, data: unknown) => void } | undefined;
  io?.emit(event, payload);
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [tournaments, teams, matches, liveMatches, upcomingDocs] = await Promise.all([
    Tournament.countDocuments(),
    Team.countDocuments(),
    Match.countDocuments(),
    Match.countDocuments({ status: "live" }),
    Match.find({ status: "scheduled" }).sort({ kickoffAt: 1 }).limit(5),
  ]);
  res.json({
    tournaments,
    teams,
    matches,
    liveMatches,
    upcomingMatches: upcomingDocs.map(toMatch),
  });
});

router.get("/tournaments", async (_req, res): Promise<void> => {
  const tournaments = await Tournament.find().sort({ createdAt: -1 });
  res.json(tournaments.map((doc) => toPlain(doc)));
});

router.post("/tournaments", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateTournamentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const baseSlug = slugify(parsed.data.name);
  const slug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`;
  const tournament = await Tournament.create({ ...parsed.data, slug });
  res.status(201).json(toPlain(tournament));
});

router.get("/tournaments/:tournamentId", async (req, res): Promise<void> => {
  const params = GetTournamentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const tournament = await Tournament.findById(params.data.tournamentId);
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  res.json(toPlain(tournament));
});

router.patch("/tournaments/:tournamentId", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateTournamentParams.safeParse(req.params);
  const body = UpdateTournamentBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const tournament = await Tournament.findByIdAndUpdate(params.data.tournamentId, body.data, { new: true, runValidators: true });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  res.json(toPlain(tournament));
});

router.get("/teams", async (req, res): Promise<void> => {
  const query = ListTeamsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const teams = await Team.find({ tournamentId: query.data.tournamentId }).sort({ name: 1 });
  res.json(teams.map((team) => toPlain(team)));
});

router.post("/teams", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tournament = await Tournament.findById(parsed.data.tournamentId);
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  const teamCount = await Team.countDocuments({ tournamentId: tournament._id });
  if (teamCount >= tournament.maxTeams) {
    res.status(409).json({ error: `This tournament is full (${tournament.maxTeams} teams).` });
    return;
  }
  try {
    const team = await Team.create(parsed.data);
    res.status(201).json(toPlain(team));
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(409).json({ error: "A team with this name is already registered." });
      return;
    }
    throw error;
  }
});

router.patch("/teams/:teamId", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateTeamParams.safeParse(req.params);
  const body = UpdateTeamBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const team = await Team.findByIdAndUpdate(params.data.teamId, body.data, { new: true, runValidators: true });
  if (!team) {
    res.status(404).json({ error: "Team not found." });
    return;
  }
  res.json(toPlain(team));
});

router.delete("/teams/:teamId", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const referenced = await Match.exists({
    $or: [{ homeTeamId: params.data.teamId }, { awayTeamId: params.data.teamId }],
  });
  if (referenced) {
    res.status(409).json({ error: "This team is already part of a fixture and cannot be removed." });
    return;
  }
  const removed = await Team.findByIdAndDelete(params.data.teamId);
  if (!removed) {
    res.status(404).json({ error: "Team not found." });
    return;
  }
  res.sendStatus(204);
});

router.get("/stages", async (req, res): Promise<void> => {
  const query = ListStagesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const stages = await Stage.find({ tournamentId: query.data.tournamentId }).sort({ order: 1 });
  res.json(stages.map((stage) => toPlain(stage)));
});

router.post("/stages", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateStageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await Tournament.exists({ _id: parsed.data.tournamentId }))) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  try {
    const stage = await Stage.create(parsed.data);
    const allStages = await Stage.find({ tournamentId: parsed.data.tournamentId }).sort({ order: 1 });
    if (allStages.length === 1) {
      stage.status = "active";
      await stage.save();
    }
    res.status(201).json(toPlain(stage));
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      res.status(409).json({ error: "A stage already uses that order number." });
      return;
    }
    throw error;
  }
});

router.post("/stages/:stageId/complete", requireAdmin, async (req, res): Promise<void> => {
  const params = CompleteStageParams.safeParse(req.params);
  const body = CompleteStageBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const stage = await Stage.findById(params.data.stageId);
  if (!stage) {
    res.status(404).json({ error: "Stage not found." });
    return;
  }
  const unfinished = await Match.exists({ stageId: String(stage._id), status: { $ne: "completed" } });
  if (unfinished) {
    res.status(409).json({ error: "All fixtures in this stage must be completed first." });
    return;
  }
  const tournament = await Tournament.findById(stage.tournamentId);
  const teamCount = await Team.countDocuments({ tournamentId: stage.tournamentId });
  const automaticTwentyTeamPath =
    tournament?.format === "group-knockout" &&
    teamCount === 20 &&
    stage.order === 1 &&
    stage.type !== "knockout";
  let qualified = [...new Set(body.data.qualifiedTeamIds ?? [])];
  let playoffTeamIds: string[] = [];
  let directQuarterFinalTeamIds: string[] = [];
  let playoffStage: InstanceType<typeof Stage> | null = null;
  let quarterFinalStage: InstanceType<typeof Stage> | null = null;

  if (automaticTwentyTeamPath) {
    const [teams, completedMatches] = await Promise.all([
      Team.find({ tournamentId: stage.tournamentId }).sort({ name: 1 }),
      Match.find({ stageId: String(stage._id), status: "completed" }),
    ]);
    if (completedMatches.length === 0) {
      res.status(409).json({ error: "Generate and complete the league or group fixtures before qualifying teams." });
      return;
    }
    const rankings = calculateStandings(teams, completedMatches);
    playoffTeamIds = rankings.slice(4, 12).map((row) => row.teamId);
    directQuarterFinalTeamIds = rankings.slice(0, 4).map((row) => row.teamId);
    qualified = rankings.slice(0, 12).map((row) => row.teamId);

    [playoffStage, quarterFinalStage] = await Promise.all([
      Stage.findOne({ tournamentId: stage.tournamentId, order: stage.order + 1 }),
      Stage.findOne({ tournamentId: stage.tournamentId, order: stage.order + 2 }),
    ]);
    if (!playoffStage || playoffStage.type !== "knockout" || !quarterFinalStage || quarterFinalStage.type !== "knockout") {
      res.status(409).json({ error: "Add a knockout Playoffs stage followed by a Quarter-finals stage before completing this 20-team league." });
      return;
    }
    if (await Match.exists({ stageId: String(playoffStage._id) })) {
      res.status(409).json({ error: "Playoff fixtures already exist. Reopen the stage sequence before retrying." });
      return;
    }
    if (await Match.exists({ stageId: String(quarterFinalStage._id) })) {
      res.status(409).json({ error: "Quarter-final fixtures already exist. Remove them before completing this stage." });
      return;
    }
  }

  const validTeams = await Team.countDocuments({ _id: { $in: qualified }, tournamentId: stage.tournamentId });
  if (validTeams !== qualified.length) {
    res.status(400).json({ error: "One or more qualified teams do not belong to this tournament." });
    return;
  }
  stage.status = "completed";
  stage.qualifiedTeamIds = qualified;
  await stage.save();

  if (automaticTwentyTeamPath && playoffStage && quarterFinalStage) {
    const playoffPairs = [
      [playoffTeamIds[0], playoffTeamIds[7]],
      [playoffTeamIds[1], playoffTeamIds[6]],
      [playoffTeamIds[2], playoffTeamIds[5]],
      [playoffTeamIds[3], playoffTeamIds[4]],
    ];
    await Match.insertMany(
      playoffPairs.map(([homeTeamId, awayTeamId], index) => ({
        tournamentId: stage.tournamentId,
        stageId: String(playoffStage!._id),
        round: `Playoff ${index + 1}`,
        homeTeamId,
        awayTeamId,
        status: "scheduled",
        kickoffAt: null,
      })),
    );
    playoffStage.status = "active";
    playoffStage.qualifiedTeamIds = playoffTeamIds;
    await playoffStage.save();
    quarterFinalStage.qualifiedTeamIds = directQuarterFinalTeamIds;
    await quarterFinalStage.save();
    broadcast(req, "fixtures:generated", await Match.find({ stageId: String(playoffStage._id) }));
    broadcast(req, "stage:updated", toPlain(playoffStage));
    broadcast(req, "stage:updated", toPlain(quarterFinalStage));
  } else {
    if (stage.type === "knockout") {
      const completedMatches = await Match.find({ stageId: String(stage._id), status: "completed" });
      if (completedMatches.length > 0) {
        const tiedMatches = completedMatches.filter((match) => match.homeScore === match.awayScore);
        const automaticWinners = completedMatches
          .filter((match) => match.homeScore !== match.awayScore)
          .map((match) => match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId);
        const participants = new Set(completedMatches.flatMap((match) => [match.homeTeamId, match.awayTeamId]));
        const byes = (stage.qualifiedTeamIds ?? []).filter((teamId) => !participants.has(teamId));
        const tiedTeamIds = new Set(tiedMatches.flatMap((match) => [match.homeTeamId, match.awayTeamId]));
        const selectedTieWinners = [...new Set(body.data.qualifiedTeamIds ?? [])].filter((teamId) => tiedTeamIds.has(teamId));
        if (selectedTieWinners.length !== tiedMatches.length) {
          res.status(400).json({ error: "Select one winner for every tied knockout match; other winners advance from the final score." });
          return;
        }
        qualified = [...new Set([...byes, ...automaticWinners, ...selectedTieWinners])];
      }
    }

    const nextStage = await Stage.findOne({ tournamentId: stage.tournamentId, order: stage.order + 1 });
    if (nextStage && qualified.length > 0) {
      const existing = await Match.countDocuments({ stageId: String(nextStage._id) });
      if (existing === 0 && nextStage.type === "knockout") {
        const bracketEntrants = [...new Set([...(nextStage.qualifiedTeamIds ?? []), ...qualified])];
        const seeded = [...bracketEntrants];
        const byes: string[] = [];
        while (seeded.length > 1) {
          const home = seeded.shift();
          const away = seeded.pop();
          if (home && away) {
            await Match.create({
              tournamentId: stage.tournamentId,
              stageId: String(nextStage._id),
              round: nextStage.name,
              homeTeamId: home,
              awayTeamId: away,
              status: "scheduled",
              kickoffAt: null,
            });
          } else if (home) {
            byes.push(home);
          }
        }
        nextStage.qualifiedTeamIds = bracketEntrants;
        nextStage.status = "active";
        await nextStage.save();
      }
    } else if (stage.type === "knockout" && qualified.length === 1) {
      await Tournament.findByIdAndUpdate(stage.tournamentId, { status: "completed", championId: qualified[0] });
    }
  }
  const refreshed = await Stage.findById(stage._id);
  broadcast(req, "stage:updated", refreshed ? toPlain(refreshed) : null);
  res.json(refreshed ? toPlain(refreshed) : {});
});

router.get("/matches", async (req, res): Promise<void> => {
  const query = ListMatchesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const filter: Record<string, unknown> = { tournamentId: query.data.tournamentId };
  if (query.data.status) filter.status = query.data.status;
  const matches = await Match.find(filter).sort({ kickoffAt: 1, createdAt: 1 });
  res.json(matches.map(toMatch));
});

router.post("/matches", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateMatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [stage, home, away] = await Promise.all([
    Stage.findOne({ _id: parsed.data.stageId, tournamentId: parsed.data.tournamentId }),
    Team.findOne({ _id: parsed.data.homeTeamId, tournamentId: parsed.data.tournamentId }),
    Team.findOne({ _id: parsed.data.awayTeamId, tournamentId: parsed.data.tournamentId }),
  ]);
  if (!stage || !home || !away || home.id === away.id) {
    res.status(400).json({ error: "Choose a valid stage and two different teams from this tournament." });
    return;
  }
  if (
    stage.type === "group" &&
    (!home.group ||
      !away.group ||
      home.group.trim().toLowerCase() !== away.group.trim().toLowerCase())
  ) {
    res.status(400).json({ error: "Group-stage fixtures must pair teams from the same group." });
    return;
  }
  const match = await Match.create({
    ...parsed.data,
    kickoffAt: parsed.data.kickoffAt ? new Date(parsed.data.kickoffAt) : null,
    status: "scheduled",
  });
  const result = toMatch(match);
  broadcast(req, "match:updated", result);
  res.status(201).json(result);
});

router.post("/matches/generate", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GenerateFixturesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [tournament, stage, teams] = await Promise.all([
    Tournament.findById(parsed.data.tournamentId),
    Stage.findOne({ _id: parsed.data.stageId, tournamentId: parsed.data.tournamentId }),
    Team.find({ tournamentId: parsed.data.tournamentId }).sort({ name: 1 }),
  ]);
  if (!tournament || !stage) {
    res.status(404).json({ error: "Tournament or stage not found." });
    return;
  }
  if (stage.type === "knockout" || teams.length < 2) {
    res.status(400).json({ error: "Round-robin fixture generation requires at least two teams and a league or group stage." });
    return;
  }
  if (await Match.exists({ stageId: String(stage._id) })) {
    res.status(409).json({ error: "Fixtures already exist for this stage." });
    return;
  }
  const teamGroups = new Map<string, typeof teams>();
  if (stage.type === "group") {
    if (teams.some((team) => !team.group?.trim())) {
      res.status(400).json({ error: "Assign every team to a group before generating group-stage fixtures." });
      return;
    }
    for (const team of teams) {
      const group = team.group!.trim();
      teamGroups.set(group, [...(teamGroups.get(group) ?? []), team]);
    }
    const groupSizes = new Set([...teamGroups.values()].map((groupTeams) => groupTeams.length));
    if (groupSizes.size > 1) {
      res.status(400).json({ error: "Groups must contain the same number of teams for fair cross-group qualification." });
      return;
    }
  } else {
    teamGroups.set("", teams);
  }

  const fixtures: Record<string, unknown>[] = [];
  const baseDate = parsed.data.kickoffAt ? new Date(parsed.data.kickoffAt) : null;
  for (const [groupName, groupTeams] of teamGroups) {
    const rotation: (string | null)[] = groupTeams.map((team) => String(team._id));
    if (rotation.length % 2 === 1) rotation.push(null);
    const rounds = rotation.length - 1;
    const perRound = rotation.length / 2;
    for (let round = 0; round < rounds; round++) {
      for (let pair = 0; pair < perRound; pair++) {
        const first = rotation[pair];
        const second = rotation[rotation.length - 1 - pair];
        if (!first || !second) continue;
        const swap = (round + pair) % 2 === 1;
        for (let leg = 0; leg < (parsed.data.doubleRoundRobin ? 2 : 1); leg++) {
          const invert = swap !== (leg === 1);
          const matchday = round + 1 + leg * rounds;
          const kickoffAt = baseDate
            ? new Date(baseDate.getTime() + (matchday - 1) * 7 * 24 * 60 * 60 * 1000)
            : null;
          const label = stage.type === "group"
            ? `${/^group\b/i.test(groupName) ? groupName : `Group ${groupName}`} · Matchday ${matchday}`
            : `Matchday ${matchday}`;
          fixtures.push({
            tournamentId: tournament._id,
            stageId: String(stage._id),
            round: label,
            homeTeamId: invert ? second : first,
            awayTeamId: invert ? first : second,
            kickoffAt,
            status: "scheduled",
          });
        }
      }
      const fixed = rotation[0];
      const tail = rotation.slice(1);
      tail.unshift(tail.pop()!);
      rotation.splice(0, rotation.length, fixed, ...tail);
    }
  }
  const created = await Match.insertMany(fixtures);
  const result = created.map(toMatch);
  stage.status = "active";
  await stage.save();
  broadcast(req, "fixtures:generated", result);
  res.status(201).json(result);
});

router.patch("/matches/:matchId", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateMatchParams.safeParse(req.params);
  const body = UpdateMatchBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const update: Record<string, unknown> = { ...body.data };
  if (body.data.kickoffAt !== undefined) {
    update.kickoffAt = body.data.kickoffAt ? new Date(body.data.kickoffAt) : null;
  }
  const match = await Match.findByIdAndUpdate(params.data.matchId, update, { new: true, runValidators: true });
  if (!match) {
    res.status(404).json({ error: "Match not found." });
    return;
  }
  const result = toMatch(match);
  broadcast(req, "match:updated", result);
  res.json(result);
});

router.delete("/matches/:matchId", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const match = await Match.findById(params.data.matchId);
  if (!match) {
    res.status(404).json({ error: "Match not found." });
    return;
  }
  if (match.status !== "scheduled") {
    res.status(409).json({ error: "Only scheduled fixtures can be deleted." });
    return;
  }
  await match.deleteOne();
  res.sendStatus(204);
});

router.get("/standings", async (req, res): Promise<void> => {
  const query = GetStandingsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const tournament = await Tournament.findById(query.data.tournamentId);
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  let stageId = query.data.stageId;
  if (!stageId) {
    const stage = await Stage.findOne({ tournamentId: query.data.tournamentId }).sort({ order: 1 });
    stageId = stage ? String(stage._id) : undefined;
  }
  const [teams, matches] = await Promise.all([
    Team.find({ tournamentId: query.data.tournamentId }).sort({ name: 1 }),
    stageId
      ? Match.find({ tournamentId: query.data.tournamentId, stageId, status: "completed" })
      : Match.find({ tournamentId: query.data.tournamentId, status: "completed" }),
  ]);
  res.json(calculateStandings(teams, matches));
});

router.post("/events", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateMatchEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const match = await Match.findById(parsed.data.matchId);
  if (!match) {
    res.status(404).json({ error: "Match not found." });
    return;
  }
  if (match.status === "completed") {
    res.status(409).json({ error: "Events cannot be added to a completed match." });
    return;
  }
  if (parsed.data.teamId && ![match.homeTeamId, match.awayTeamId].includes(parsed.data.teamId)) {
    res.status(400).json({ error: "The event team is not part of this match." });
    return;
  }
  match.events.push({
    type: parsed.data.type,
    minute: parsed.data.minute,
    teamId: parsed.data.teamId ?? null,
    playerName: parsed.data.playerName ?? "",
    detail: parsed.data.detail ?? "",
  } as never);
  if (parsed.data.type === "goal" && parsed.data.teamId) {
    if (parsed.data.teamId === match.homeTeamId) match.homeScore += 1;
    else match.awayScore += 1;
  }
  const saved = await match.save();
  const result = toMatch(saved);
  const event = result.events[result.events.length - 1];
  res.status(201).json(CreateMatchEventResponse.parse(event));
  broadcast(req, "match:updated", result);
});

router.get("/events", async (req, res): Promise<void> => {
  const query = ListMatchEventsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const match = await Match.findById(query.data.matchId);
  if (!match) {
    res.status(404).json({ error: "Match not found." });
    return;
  }
  res.json(toMatch(match).events);
});

export default router;
