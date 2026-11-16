type FixtureTeam = {
  _id: unknown;
  group?: string | null;
};

type FixtureOptions = {
  tournamentId: unknown;
  stageId: string;
  teams: FixtureTeam[];
  stageName: string;
  groupStage: boolean;
  doubleRoundRobin?: boolean;
  kickoffAt?: Date | null;
};

export function nextSaturdayKickoff(from = new Date()): Date {
  const kickoff = new Date(from);
  kickoff.setUTCHours(12, 0, 0, 0);
  const daysUntilSaturday = (6 - kickoff.getUTCDay() + 7) % 7 || 7;
  kickoff.setUTCDate(kickoff.getUTCDate() + daysUntilSaturday);
  return kickoff;
}

export function generateRoundRobinFixtures(options: FixtureOptions): Record<string, unknown>[] {
  const groups = new Map<string, FixtureTeam[]>();
  if (options.groupStage) {
    if (options.teams.some((team) => !team.group?.trim())) {
      throw new Error("Assign every team to a group before generating group-stage fixtures.");
    }
    for (const team of options.teams) {
      const group = team.group!.trim();
      groups.set(group, [...(groups.get(group) ?? []), team]);
    }
  } else {
    groups.set("", options.teams);
  }

  const baseDate = options.kickoffAt ?? nextSaturdayKickoff();
  const fixtures: Record<string, unknown>[] = [];
  const groupEntries = [...groups.entries()];

  groupEntries.forEach(([groupName, groupTeams], groupIndex) => {
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
        for (let leg = 0; leg < (options.doubleRoundRobin ? 2 : 1); leg++) {
          const invert = swap !== (leg === 1);
          const matchday = round + 1 + leg * rounds;
          const slot = groupIndex * perRound + pair;
          const kickoff = new Date(
            baseDate.getTime() +
              (matchday - 1) * 7 * 24 * 60 * 60 * 1000 +
              slot * 3 * 60 * 60 * 1000,
          );
          const groupLabel = /^group\b/i.test(groupName) ? groupName : `Group ${groupName}`;
          fixtures.push({
            tournamentId: options.tournamentId,
            stageId: options.stageId,
            round: options.groupStage ? `${groupLabel} · Matchday ${matchday}` : `Matchday ${matchday}`,
            homeTeamId: invert ? second : first,
            awayTeamId: invert ? first : second,
            kickoffAt: kickoff,
            status: "scheduled",
          });
        }
      }

      const fixed = rotation[0];
      const tail = rotation.slice(1);
      tail.unshift(tail.pop()!);
      rotation.splice(0, rotation.length, fixed, ...tail);
    }
  });

  return fixtures;
}

export function generateOpeningKnockoutFixtures(options: {
  tournamentId: unknown;
  stageId: string;
  stageName: string;
  teams: FixtureTeam[];
  kickoffAt?: Date | null;
}): { fixtures: Record<string, unknown>[]; byes: string[]; participants: string[] } {
  const teams = options.teams.map((team) => String(team._id));
  const nextBracketSize = 2 ** Math.floor(Math.log2(teams.length));
  const isPowerOfTwo = Number.isInteger(Math.log2(teams.length));
  const byeCount = isPowerOfTwo ? 0 : nextBracketSize * 2 - teams.length;
  const byes = teams.slice(0, byeCount);
  const participants = teams.slice(byeCount);
  const baseDate = options.kickoffAt ?? nextSaturdayKickoff();
  const fixtures: Record<string, unknown>[] = [];

  for (let index = 0; index < participants.length / 2; index++) {
    fixtures.push({
      tournamentId: options.tournamentId,
      stageId: options.stageId,
      round: options.stageName,
      homeTeamId: participants[index],
      awayTeamId: participants[participants.length - 1 - index],
      kickoffAt: new Date(baseDate.getTime() + index * 3 * 60 * 60 * 1000),
      status: "scheduled",
    });
  }

  return { fixtures, byes, participants };
}
