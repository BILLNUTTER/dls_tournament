import assert from "node:assert/strict";
import test from "node:test";
import {
  generateOpeningKnockoutFixtures,
  generateRoundRobinFixtures,
} from "./fixture-generation.ts";

function makeTeams(groups) {
  return Object.entries(groups).flatMap(([group, count]) =>
    Array.from({ length: count }, (_, index) => ({
      _id: `${group}-${index + 1}`,
      group,
    })),
  );
}

test("group-stage fixtures only pair clubs from the same group", () => {
  const teams = makeTeams({ A: 4, B: 4 });
  const fixtures = generateRoundRobinFixtures({
    tournamentId: "cup",
    stageId: "groups",
    stageName: "Group stage",
    teams,
    groupStage: true,
    kickoffAt: new Date("2027-01-02T12:00:00.000Z"),
  });

  assert.equal(fixtures.length, 12);
  for (const fixture of fixtures) {
    const home = teams.find((team) => team._id === fixture.homeTeamId);
    const away = teams.find((team) => team._id === fixture.awayTeamId);
    assert.ok(home && away);
    assert.equal(home.group, away.group);
    assert.match(String(fixture.round), /^Group [AB] · Matchday \d+$/);
    assert.ok(fixture.kickoffAt instanceof Date);
  }
});

test("20 teams in four groups produce ten fixtures per group", () => {
  const teams = makeTeams({ A: 5, B: 5, C: 5, D: 5 });
  const fixtures = generateRoundRobinFixtures({
    tournamentId: "champions-cup",
    stageId: "groups",
    stageName: "Group stage",
    teams,
    groupStage: true,
    kickoffAt: new Date("2027-01-02T12:00:00.000Z"),
  });

  assert.equal(fixtures.length, 40);
  for (const group of ["A", "B", "C", "D"]) {
    assert.equal(fixtures.filter((fixture) => String(fixture.round).startsWith(`Group ${group} ·`)).length, 10);
  }
});

test("double round robin schedules each pairing home and away", () => {
  const teams = makeTeams({ A: 2 });
  const fixtures = generateRoundRobinFixtures({
    tournamentId: "league",
    stageId: "league-stage",
    stageName: "League phase",
    teams,
    groupStage: false,
    doubleRoundRobin: true,
    kickoffAt: new Date("2027-01-02T12:00:00.000Z"),
  });

  assert.equal(fixtures.length, 2);
  assert.equal(fixtures[0].homeTeamId, fixtures[1].awayTeamId);
  assert.equal(fixtures[0].awayTeamId, fixtures[1].homeTeamId);
});

test("20-team knockout opening creates four preliminary fixtures and twelve byes", () => {
  const result = generateOpeningKnockoutFixtures({
    tournamentId: "cup",
    stageId: "opening",
    stageName: "Opening round",
    teams: makeTeams({ A: 20 }),
    kickoffAt: new Date("2027-01-02T12:00:00.000Z"),
  });

  assert.equal(result.fixtures.length, 4);
  assert.equal(result.byes.length, 12);
  assert.equal(result.participants.length, 8);
});

test("power-of-two knockout brackets start with every team playing", () => {
  const result = generateOpeningKnockoutFixtures({
    tournamentId: "cup",
    stageId: "round-of-16",
    stageName: "Round of 16",
    teams: makeTeams({ A: 16 }),
    kickoffAt: new Date("2027-01-02T12:00:00.000Z"),
  });

  assert.equal(result.fixtures.length, 8);
  assert.equal(result.byes.length, 0);
  assert.equal(result.participants.length, 16);
});
