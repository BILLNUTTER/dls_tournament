import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { Route, Switch, Link, useLocation, useParams, Router as WouterRouter } from 'wouter';
import {
  ArrowRight, ChevronRight, Flag, LayoutDashboard, LogOut, Plus, Swords, Trophy, Users, Radio,
} from 'lucide-react';
import {
  useGetDashboard, useListTournaments, useGetTournament, useCreateTournament,
  useUpdateTournament, useListTeams, useCreateTeam, useUpdateTeam, useDeleteTeam,
  useListStages, useCreateStage, useCompleteStage, useListMatches, useCreateMatch,
  useGenerateFixtures, useUpdateMatch, useDeleteMatch, useGetStandings, useCreateMatchEvent,
  useListMatchEvents, useGetSetupStatus, useSetupAdmin, useLoginAdmin, useGetAdminSession,
  useLogoutAdmin, getGetDashboardQueryKey, getListTournamentsQueryKey, getListTeamsQueryKey,
  getListStagesQueryKey, getListMatchesQueryKey, getGetStandingsQueryKey,
  getListMatchEventsQueryKey, getGetAdminSessionQueryKey, getGetTournamentQueryKey,
} from '@workspace/api-client-react';
import type { Match, Standing, Team, Tournament } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
type Notify = (message: string, error?: boolean) => void;

function useNotify() {
  const [notice, setNotice] = useState('');
  const notify: Notify = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3200);
  };
  return { notice, notify };
}

function Feedback({ message }: { message: string }) {
  return message ? <div className="toast" role="status" data-testid="status-notice">{message}</div> : null;
}

function Crest({ team, className = '' }: { team?: Partial<Team> | null; className?: string }) {
  const letters = team?.shortName || team?.name?.split(/\s+/).map((word) => word[0]).join('').slice(0, 3) || 'FC';
  return team?.logoUrl
    ? <img className={`crest ${className}`} src={team.logoUrl} alt={`${team.name || 'Club'} crest`} />
    : <span className={`crest ${className}`} aria-label={`${team?.name || 'Club'} crest`}>{letters.toUpperCase()}</span>;
}

function Brand({ admin = false }: { admin?: boolean }) {
  return <Link href="/" className="brand" data-testid="link-home"><span className="brand-mark"><Trophy size={18} /></span><span>{admin ? 'TOURNAMENT DESK' : 'MATCHDAY'}</span></Link>;
}

const publicNav = [
  ['/standings', 'Standings'], ['/fixtures', 'Fixtures'], ['/results', 'Results'],
  ['/live', 'Live'], ['/teams', 'Teams'], ['/bracket', 'Bracket'],
];

function PublicShell({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  return <div className="site">
    <header className="topbar">
      <Brand />
      <nav className="navlinks" aria-label="Tournament navigation">
        {publicNav.map(([href, label]) => <Link href={href} className={`${path === href ? 'active ' : ''}${href === '/live' ? 'nav-live' : ''}`} key={href} data-testid={`link-nav-${label.toLowerCase()}`}>{href === '/live' && <Radio size={13} />}{label}</Link>)}
        <Link href="/admin/login" className="tag" data-testid="link-admin">Admin <ChevronRight size={12} /></Link>
      </nav>
    </header>
    {children}
    <footer className="footer"><div className="wrap" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}><span>Matchday · Tournament operations, made clear.</span><Link href="/admin/login">Organizer access</Link></div></footer>
  </div>;
}

function PublicTitle({ eyebrow = 'COMPETITION CENTRE', title, description }: { eyebrow?: string; title: string; description?: string }) {
  return <div className="page-title"><div className="wrap"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div></div>;
}

function LoadingRows() {
  return <div className="panel"><div className="panel-body" style={{ display: 'grid', gap: 17 }}>{[1, 2, 3, 4].map((item) => <div className="skeleton" key={item} style={{ width: `${98 - item * 8}%` }} />)}</div></div>;
}

function Failure({ retry }: { retry: () => void }) {
  return <div className="empty"><strong>We lost the signal</strong><p>Competition data could not be loaded right now.</p><button onClick={retry} className="btn small">Try again</button></div>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty"><strong>{title}</strong><p>{detail}</p></div>;
}

function TeamLabel({ team, away = false }: { team?: Team; away?: boolean }) {
  return <div className={`match-team ${away ? 'away' : ''}`}><Crest team={team} /><span>{team?.name || 'To be confirmed'}</span></div>;
}

function MatchLine({ match, teams }: { match: Match; teams: Team[] }) {
  const home = teams.find((team) => team.id === match.homeTeamId);
  const away = teams.find((team) => team.id === match.awayTeamId);
  const date = match.kickoffAt ? new Date(match.kickoffAt) : null;
  return <Link href={`/match/${match.id}`} className="match-row" data-testid={`link-match-${match.id}`}>
    <span className="match-date">{date ? `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : match.round || 'Schedule pending'}</span>
    <TeamLabel team={home} />
    <span className="score">{match.status === 'scheduled' ? '—' : `${match.homeScore} : ${match.awayScore}`}</span>
    <TeamLabel team={away} away />
    {match.status === 'live' ? <span className="tag live"><i className="live-dot" />{match.minute ? `${match.minute}′` : 'Live'}</span> : <span className="tag">{match.status}</span>}
  </Link>;
}

function StandingsTable({ standings }: { standings: Standing[] }) {
  return <div className="panel" style={{ overflowX: 'auto' }}><table className="table" data-testid="table-standings">
    <thead><tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead>
    <tbody>{standings.map((row, index) => <tr key={row.teamId} data-testid={`row-standing-${row.teamId}`}>
      <td className="rank">{String(index + 1).padStart(2, '0')}</td><td><span className="team-name"><Crest team={{ name: row.teamName, shortName: row.shortName, logoUrl: row.logoUrl }} />{row.teamName}</span></td>
      <td>{row.played}</td><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td><strong>{row.points}</strong></td>
    </tr>)}</tbody>
  </table>{standings.length === 0 && <Empty title="No table yet" detail="Standings appear when the competition has recorded results." />}</div>;
}

function TournamentSelect({ tournaments, value, onChange }: { tournaments: Tournament[]; value: string; onChange: (id: string) => void }) {
  return <select aria-label="Select tournament" value={value} onChange={(event) => onChange(event.target.value)} data-testid="select-tournament">
    {tournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.name}</option>)}
  </select>;
}

function HomePage() {
  const dashboard = useGetDashboard();
  const tournamentsQuery = useListTournaments();
  const tournaments = tournamentsQuery.data || [];
  const selected = tournaments.find((t) => t.status === 'active') || tournaments[0];
  const teamsQuery = useListTeams({ tournamentId: selected?.id || '' }, { query: { enabled: !!selected, queryKey: getListTeamsQueryKey({ tournamentId: selected?.id || '' }) } });
  const matchesQuery = useListMatches({ tournamentId: selected?.id || '' }, { query: { enabled: !!selected, queryKey: getListMatchesQueryKey({ tournamentId: selected?.id || '' }) } });
  const tableQuery = useGetStandings({ tournamentId: selected?.id || '' }, { query: { enabled: !!selected, queryKey: getGetStandingsQueryKey({ tournamentId: selected?.id || '' }) } });
  const matches = matchesQuery.data || [];
  const teams = teamsQuery.data || [];
  const sortedUpcoming = matches.filter((match) => match.status !== 'completed').slice(0, 4);
  return <PublicShell>
    <section className="hero"><div className="hero-inner">
      <div className="eyebrow">THE COMPETITION, IN FULL VIEW</div>
      <h1>{selected?.name || 'Football starts here.'}</h1>
      <p>{selected?.description || 'Every fixture. Every table. Every moment that matters. Follow the tournament from first whistle to final.'}</p>
      <div className="hero-actions">{selected && <Link className="btn lime" href={`/tournament/${selected.slug}`}>Explore tournament <ArrowRight size={15} /></Link>}<Link className="btn secondary" href="/live"><Radio size={15} /> Follow live</Link></div>
    </div></section>
    <main className="wrap section">
      <div className="section-head"><div><div className="eyebrow">RIGHT NOW</div><h2>Matchday at a glance</h2></div><Link href="/fixtures" className="btn small">Full schedule <ArrowRight size={14} /></Link></div>
      <div className="grid-main">
        <section className="panel"><div className="panel-head"><h3>Next on the pitch</h3><span className="tag">{selected?.name || 'Tournament'}</span></div>
          {matchesQuery.isLoading ? <LoadingRows /> : matchesQuery.isError ? <Failure retry={() => matchesQuery.refetch()} /> : sortedUpcoming.length ? sortedUpcoming.map((match) => <MatchLine match={match} teams={teams} key={match.id} />) : <Empty title="Fixtures are taking shape" detail="Once games are scheduled, they will appear here." />}
        </section>
        <section className="panel"><div className="panel-head"><h3>League table</h3><Link href="/standings" className="tag">Full table <ArrowRight size={12} /></Link></div>
          {tableQuery.isLoading ? <LoadingRows /> : tableQuery.isError ? <Failure retry={() => tableQuery.refetch()} /> : <div style={{ overflowX: 'auto' }}><table className="table"><thead><tr><th>#</th><th>Club</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>{(tableQuery.data || []).slice(0, 5).map((row, index) => <tr key={row.teamId}><td className="rank">{index + 1}</td><td><span className="team-name"><Crest team={{ name: row.teamName, shortName: row.shortName, logoUrl: row.logoUrl }} />{row.shortName || row.teamName}</span></td><td>{row.played}</td><td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td><td><strong>{row.points}</strong></td></tr>)}</tbody></table>{!tableQuery.data?.length && <div className="empty">Standings will appear after play begins.</div>}</div>}
        </section>
      </div>
      <div className="stat-grid" style={{ marginTop: 23 }}><div className="stat"><small>Tournaments</small><strong>{dashboard.data?.tournaments ?? '—'}</strong></div><div className="stat"><small>Registered clubs</small><strong>{dashboard.data?.teams ?? '—'}</strong></div><div className="stat"><small>Games played</small><strong>{dashboard.data?.matches ?? '—'}</strong></div><div className="stat"><small>Live now</small><strong>{dashboard.data?.liveMatches ?? 0}</strong></div></div>
      {tournamentsQuery.isError && <Failure retry={() => tournamentsQuery.refetch()} />}
    </main>
  </PublicShell>;
}

function StandingsPage() {
  const tournamentsQuery = useListTournaments();
  const tournaments = tournamentsQuery.data || [];
  const [id, setId] = useState('');
  const currentId = id || tournaments.find((t) => t.status === 'active')?.id || tournaments[0]?.id || '';
  const standings = useGetStandings({ tournamentId: currentId }, { query: { enabled: !!currentId, queryKey: getGetStandingsQueryKey({ tournamentId: currentId }) } });
  const tournament = tournaments.find((t) => t.id === currentId);
  return <PublicShell><PublicTitle title="Standings" description="A clear picture of the race, updated as results come in." /><main className="wrap section">
    <div className="filterbar"><TournamentSelect tournaments={tournaments} value={currentId} onChange={setId} />{tournament && <span className="tag">{tournament.format.replace('-', ' ')}</span>}</div>
    {standings.isLoading || tournamentsQuery.isLoading ? <LoadingRows /> : standings.isError ? <Failure retry={() => standings.refetch()} /> : <StandingsTable standings={standings.data || []} />}
  </main></PublicShell>;
}

function MatchesPage({ mode }: { mode: 'fixtures' | 'results' | 'live' }) {
  const tournamentsQuery = useListTournaments();
  const tournaments = tournamentsQuery.data || [];
  const [id, setId] = useState('');
  const tournamentId = id || tournaments.find((t) => t.status === 'active')?.id || tournaments[0]?.id || '';
  const query = useListMatches({ tournamentId, ...(mode === 'live' ? { status: 'live' as const } : mode === 'results' ? { status: 'completed' as const } : { status: 'scheduled' as const }) }, { query: { enabled: !!tournamentId, queryKey: getListMatchesQueryKey({ tournamentId, ...(mode === 'live' ? { status: 'live' as const } : mode === 'results' ? { status: 'completed' as const } : { status: 'scheduled' as const }) }) } });
  const teamsQuery = useListTeams({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListTeamsQueryKey({ tournamentId }) } });
  const copy = mode === 'fixtures' ? ['Fixtures', 'Every kickoff, in its place.'] : mode === 'results' ? ['Results', 'The final whistle, recorded.'] : ['Live scores', 'Follow the action as it unfolds.'];
  return <PublicShell><PublicTitle eyebrow={mode === 'live' ? 'IN PLAY' : undefined} title={copy[0]} description={copy[1]} /><main className="wrap section">
    <div className="filterbar"><TournamentSelect tournaments={tournaments} value={tournamentId} onChange={setId} />{mode === 'live' && <span className="tag live"><i className="live-dot" /> Live centre</span>}</div>
    {query.isLoading || teamsQuery.isLoading ? <LoadingRows /> : query.isError ? <Failure retry={() => query.refetch()} /> : query.data?.length ? <section className="panel">{query.data.map((match) => <MatchLine match={match} teams={teamsQuery.data || []} key={match.id} />)}</section> : <Empty title={mode === 'live' ? 'No matches in play' : 'Nothing scheduled here yet'} detail={mode === 'results' ? 'Completed games will show here.' : 'Check back when the fixture list is published.'} />}
  </main></PublicShell>;
}

function TeamsPage() {
  const tournamentsQuery = useListTournaments();
  const tournaments = tournamentsQuery.data || [];
  const [id, setId] = useState('');
  const tournamentId = id || tournaments.find((t) => t.status === 'active')?.id || tournaments[0]?.id || '';
  const teamsQuery = useListTeams({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListTeamsQueryKey({ tournamentId }) } });
  const teams = teamsQuery.data || [];
  return <PublicShell><PublicTitle title="The clubs" description="Meet the sides competing for the cup." /><main className="wrap section">
    <div className="filterbar"><TournamentSelect tournaments={tournaments} value={tournamentId} onChange={setId} /><span className="tag">{teams.length} registered</span></div>
    {teamsQuery.isLoading ? <LoadingRows /> : teamsQuery.isError ? <Failure retry={() => teamsQuery.refetch()} /> : teams.length ? <div className="grid-main" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(245px,1fr))' }}>{teams.map((team) => <article className="panel" key={team.id} style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 15 }}><Crest team={team} className="team-card-crest" /><div><strong>{team.name}</strong><div className="match-date">{team.city || 'Club'}{team.group ? ` · Group ${team.group}` : ''}</div></div></article>)}</div> : <Empty title="The roster is open" detail="Registered clubs will be listed here." />}
  </main></PublicShell>;
}

function BracketPage() {
  const tournamentsQuery = useListTournaments();
  const tournaments = tournamentsQuery.data || [];
  const [id, setId] = useState('');
  const tournamentId = id || tournaments.find((t) => t.status === 'active')?.id || tournaments[0]?.id || '';
  const stagesQuery = useListStages({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListStagesQueryKey({ tournamentId }) } });
  const teamsQuery = useListTeams({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListTeamsQueryKey({ tournamentId }) } });
  const knockout = (stagesQuery.data || []).filter((stage) => stage.type === 'knockout').sort((a, b) => a.order - b.order);
  return <PublicShell><PublicTitle title="The bracket" description="The road to the final, round by round." /><main className="wrap section"><div className="filterbar"><TournamentSelect tournaments={tournaments} value={tournamentId} onChange={setId} /></div>
    {stagesQuery.isLoading || teamsQuery.isLoading ? <LoadingRows /> : knockout.length ? <div className="bracket">{knockout.map((stage) => <div className="bracket-round" key={stage.id}><h3>{stage.name}</h3>{(stage.qualifiedTeamIds || []).length ? (stage.qualifiedTeamIds || []).map((teamId) => <div className="bracket-match" key={teamId}><div className="bracket-team">{teamsQuery.data?.find((team) => team.id === teamId)?.name || 'Qualified club'}<span>—</span></div></div>) : <div className="bracket-match"><div className="bracket-team">Qualification pending</div></div>}</div>)}</div> : <Empty title="Knockout path pending" detail="The bracket will appear once knockout stages are set." />}
  </main></PublicShell>;
}

function TournamentPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const list = useListTournaments();
  const tournament = (list.data || []).find((item) => item.slug === slug);
  const detail = useGetTournament(tournament?.id || '', { query: { enabled: !!tournament?.id, queryKey: getGetTournamentQueryKey(tournament?.id || '') } });
  const tournamentId = tournament?.id || '';
  const teamsQuery = useListTeams({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListTeamsQueryKey({ tournamentId }) } });
  const matchesQuery = useListMatches({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListMatchesQueryKey({ tournamentId }) } });
  const tableQuery = useGetStandings({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getGetStandingsQueryKey({ tournamentId }) } });
  const chosen = detail.data || tournament;
  if (list.isLoading) return <PublicShell><main className="wrap section"><LoadingRows /></main></PublicShell>;
  if (!chosen) return <PublicShell><PublicTitle title="Tournament not found" /><main className="wrap section"><Empty title="No competition at this address" detail="Check the link or return to the tournament overview." /></main></PublicShell>;
  return <PublicShell><PublicTitle eyebrow={chosen.status.toUpperCase()} title={chosen.name} description={chosen.description || `${chosen.format.replace('-', ' ')} competition · ${chosen.venue || 'Venue to be confirmed'}`} /><main className="wrap section">
    <div className="grid-main"><section className="panel"><div className="panel-head"><h3>Upcoming & live</h3><Link href="/fixtures" className="tag">All fixtures <ArrowRight size={12} /></Link></div>{matchesQuery.data?.length ? matchesQuery.data.filter((m) => m.status !== 'completed').slice(0, 4).map((match) => <MatchLine key={match.id} match={match} teams={teamsQuery.data || []} />) : <Empty title="Fixtures are coming together" detail="Match information will appear when published." />}</section><section className="panel"><div className="panel-head"><h3>At a glance</h3></div><div className="panel-body"><p>{chosen.venue || 'Venue to be confirmed'}</p><p>{teamsQuery.data?.length || 0} of {chosen.maxTeams} clubs registered</p><span className={`tag ${chosen.status === 'active' ? 'live' : ''}`}>{chosen.status}</span></div></section></div>
    <section style={{ marginTop: 24 }}><div className="section-head"><div><div className="eyebrow">THE TABLE</div><h2>Current standings</h2></div><Link href="/standings" className="tag">Full table <ArrowRight size={12} /></Link></div>{tableQuery.data && <StandingsTable standings={tableQuery.data} />}</section>
  </main></PublicShell>;
}

function MatchPage() {
  const { id = '' } = useParams<{ id: string }>();
  const tournamentsQuery = useListTournaments();
  const tournaments = tournamentsQuery.data || [];
  const [selected, setSelected] = useState('');
  const tournamentId = selected || tournaments.find((t) => t.status === 'active')?.id || tournaments[0]?.id || '';
  const matchesQuery = useListMatches({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListMatchesQueryKey({ tournamentId }) } });
  const teamsQuery = useListTeams({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListTeamsQueryKey({ tournamentId }) } });
  const match = (matchesQuery.data || []).find((item) => item.id === id);
  const eventsQuery = useListMatchEvents({ matchId: id }, { query: { enabled: !!match, queryKey: getListMatchEventsQueryKey({ matchId: id }) } });
  const teams = teamsQuery.data || [];
  if (matchesQuery.isLoading) return <PublicShell><main className="wrap section"><LoadingRows /></main></PublicShell>;
  return <PublicShell><PublicTitle title="Match centre" description={match?.round || 'The full story of this fixture.'} /><main className="wrap section">
    {!match ? <><div className="filterbar"><TournamentSelect tournaments={tournaments} value={tournamentId} onChange={setSelected} /></div><Empty title="Match not found" detail="This match may belong to another competition or is not available yet." /></> : <>
      <div className="panel" style={{ padding: '32px 20px', textAlign: 'center' }}><span className={`tag ${match.status === 'live' ? 'live' : ''}`}>{match.status === 'live' && <i className="live-dot" />}{match.status}{match.minute ? ` · ${match.minute}′` : ''}</span><div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 20, maxWidth: 740, margin: '26px auto' }}><div><Crest team={teams.find((team) => team.id === match.homeTeamId)} /><h2 className="display">{teams.find((team) => team.id === match.homeTeamId)?.name || 'Home'}</h2></div><strong className="mono" style={{ fontSize: 34 }}>{match.homeScore} : {match.awayScore}</strong><div><Crest team={teams.find((team) => team.id === match.awayTeamId)} /><h2 className="display">{teams.find((team) => team.id === match.awayTeamId)?.name || 'Away'}</h2></div></div><p className="match-date">{match.kickoffAt ? new Date(match.kickoffAt).toLocaleString() : 'Kickoff time pending'}{match.venue ? ` · ${match.venue}` : ''}</p></div>
      <section style={{ maxWidth: 700, margin: '32px auto' }}><div className="section-head"><div><div className="eyebrow">MATCH TIMELINE</div><h2>Key moments</h2></div></div>{eventsQuery.isLoading ? <LoadingRows /> : (eventsQuery.data || match.events || []).length ? <div className="panel">{(eventsQuery.data || match.events || []).map((event) => <div className="list-card" key={event.id}><span className="tag">{event.minute}′</span><div style={{ flex: 1 }}><strong>{event.type.replace('-', ' ')}</strong><div className="match-date">{event.playerName || ''}{event.detail ? ` · ${event.detail}` : ''}</div></div></div>)}</div> : <Empty title="A clean sheet of moments" detail="No match events have been recorded yet." />}</section>
    </>}
  </main></PublicShell>;
}

function AdminFrame({ children }: { children: ReactNode }) {
  const [path, setPath] = useLocation();
  const logout = useLogoutAdmin();
  const qc = useQueryClient();
  const nav = [
    ['/admin', 'Overview', LayoutDashboard], ['/admin/tournaments', 'Tournaments', Trophy],
    ['/admin/teams', 'Teams', Users], ['/admin/stages', 'Stages', Flag], ['/admin/matches', 'Matches', Swords],
  ] as const;
  return <div className="admin-shell"><header className="admin-nav"><Brand admin /><div style={{ display: 'flex', alignItems: 'center', gap: 15 }}><span className="match-date">OPERATIONS CONSOLE</span><button className="btn small secondary" onClick={() => logout.mutate(undefined, { onSuccess: () => { qc.setQueryData(getGetAdminSessionQueryKey(), null); setPath('/admin/login'); } })} disabled={logout.isPending} data-testid="button-logout"><LogOut size={14} /> Sign out</button></div></header><div className="admin-layout"><aside className="admin-side">{nav.map(([href, label, Icon]) => <Link href={href} key={href} className={path === href ? 'active' : ''} data-testid={`link-admin-${label.toLowerCase()}`}><Icon size={16} />{label}</Link>)}<Link href="/" style={{ marginTop: 'auto' }}><ArrowRight size={16} />View public site</Link></aside><main className="admin-content">{children}</main></div></div>;
}

function AdminGate({ children }: { children: ReactNode }) {
  const session = useGetAdminSession();
  const [, setPath] = useLocation();
  if (session.isLoading) return <div className="admin-shell"><div className="wrap section"><LoadingRows /></div></div>;
  if (session.isError || !session.data) {
    if (typeof window !== 'undefined') setTimeout(() => setPath('/admin/login'), 0);
    return <div className="admin-shell"><div className="wrap section"><Empty title="Administrator access required" detail="Redirecting to secure sign in." /></div></div>;
  }
  return <AdminFrame>{children}</AdminFrame>;
}

function AdminHome() {
  const dashboard = useGetDashboard();
  const tournaments = useListTournaments();
  return <><div className="eyebrow">TOURNAMENT OPERATIONS</div><h1>Overview</h1><div className="subhead">Your competitions, fixtures and matchday activity in one place.</div>
    {dashboard.isLoading ? <LoadingRows /> : dashboard.isError ? <Failure retry={() => dashboard.refetch()} /> : <>
      <div className="stat-grid"><div className="stat"><small>Competitions</small><strong>{dashboard.data?.tournaments ?? 0}</strong></div><div className="stat"><small>Registered teams</small><strong>{dashboard.data?.teams ?? 0}</strong></div><div className="stat"><small>Total matches</small><strong>{dashboard.data?.matches ?? 0}</strong></div><div className="stat"><small>Live matches</small><strong>{dashboard.data?.liveMatches ?? 0}</strong></div></div>
      <div className="grid-main"><section className="panel"><div className="panel-head"><h3>Upcoming fixtures</h3><Link href="/admin/matches" className="tag">Manage <ArrowRight size={12} /></Link></div>{dashboard.data?.upcomingMatches?.length ? dashboard.data.upcomingMatches.map((match) => <div className="list-card" key={match.id}><div><strong>{match.round || 'Scheduled match'}</strong><div className="match-date">{match.kickoffAt ? new Date(match.kickoffAt).toLocaleString() : 'Time pending'}</div></div><span className="tag">{match.status}</span></div>) : <Empty title="No fixtures ahead" detail="Create a stage and schedule matches to get started." />}</section>
      <section className="panel"><div className="panel-head"><h3>Competitions</h3><Link href="/admin/tournaments" className="tag">Manage <ArrowRight size={12} /></Link></div>{tournaments.data?.slice(0, 5).map((item) => <Link className="list-card" key={item.id} href="/admin/tournaments"><strong>{item.name}</strong><span className={`tag ${item.status === 'active' ? 'live' : ''}`}>{item.status}</span></Link>)}{!tournaments.data?.length && <Empty title="Start your first tournament" detail="Set up a competition in a few minutes." />}</section></div>
    </>}
  </>;
}

function Field({ label, name, value, onChange, type = 'text', required = false, options }: { label: string; name: string; value: string | number; onChange: (value: string) => void; type?: string; required?: boolean; options?: string[] }) {
  return <div className="field"><label htmlFor={name}>{label}</label>{options ? <select id={name} value={value} onChange={(event) => onChange(event.target.value)} required={required} data-testid={`input-${name}`}>{options.map((option) => <option key={option} value={option}>{option.replace('-', ' ')}</option>)}</select> : <input id={name} name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} data-testid={`input-${name}`} />}</div>;
}

function AdminTournaments() {
  const qc = useQueryClient();
  const query = useListTournaments();
  const create = useCreateTournament();
  const update = useUpdateTournament();
  const [editing, setEditing] = useState('');
  const [form, setForm] = useState({ name: '', description: '', venue: '', logoUrl: '', format: 'league', maxTeams: '16', status: 'draft' });
  const { notice, notify } = useNotify();
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const reset = () => { setEditing(''); setForm({ name: '', description: '', venue: '', logoUrl: '', format: 'league', maxTeams: '16', status: 'draft' }); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const data = { ...form, maxTeams: Number(form.maxTeams), format: form.format as 'league' | 'knockout' | 'group-knockout', status: form.status as 'draft' | 'active' };
    if (editing) update.mutate({ tournamentId: editing, data }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTournamentsQueryKey() }); notify('Competition updated.'); reset(); }, onError: () => notify('Could not update this competition.') });
    else create.mutate({ data }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTournamentsQueryKey() }); notify('Competition created.'); reset(); }, onError: () => notify('Could not create this competition.') });
  };
  const edit = (item: Tournament) => { setEditing(item.id); setForm({ name: item.name, description: item.description || '', venue: item.venue || '', logoUrl: item.logoUrl || '', format: item.format, maxTeams: String(item.maxTeams), status: item.status === 'completed' ? 'active' : item.status }); };
  return <><div className="eyebrow">COMPETITION SETUP</div><h1>Tournaments</h1><div className="subhead">Create a competition or keep its details current.</div><div className="grid-main" style={{ gridTemplateColumns: 'minmax(270px,.75fr) minmax(0,1.4fr)' }}>
    <form className="panel panel-body" onSubmit={submit}><h3 className="display" style={{ fontSize: 23, marginTop: 0 }}>{editing ? 'Edit competition' : 'New competition'}</h3><div className="field"><label htmlFor="tour-name">Competition name</label><input id="tour-name" value={form.name} onChange={(e) => set('name')(e.target.value)} required minLength={2} data-testid="input-tournament-name" /></div><div className="field"><label htmlFor="tour-description">Description</label><textarea id="tour-description" rows={3} value={form.description} onChange={(e) => set('description')(e.target.value)} data-testid="input-tournament-description" /></div><Field label="Host venue" name="venue" value={form.venue} onChange={set('venue')} /><Field label="Logo URL" name="logoUrl" value={form.logoUrl} onChange={set('logoUrl')} /><div className="form-grid"><Field label="Format" name="format" value={form.format} options={['league', 'knockout', 'group-knockout']} onChange={set('format')} /><Field label="Max teams" name="maxTeams" type="number" value={form.maxTeams} onChange={set('maxTeams')} /><Field label="Status" name="status" value={form.status} options={['draft', 'active']} onChange={set('status')} /></div><div className="actions"><button className="btn" type="submit" disabled={create.isPending || update.isPending}>{editing ? 'Save changes' : 'Create competition'}</button>{editing && <button className="btn secondary" type="button" onClick={reset}>Cancel</button>}</div></form>
    <section className="panel"><div className="panel-head"><h3>All competitions</h3><span className="tag">{query.data?.length || 0}</span></div>{query.isLoading ? <LoadingRows /> : query.isError ? <Failure retry={() => query.refetch()} /> : query.data?.length ? query.data.map((item) => <div className="list-card" key={item.id}><div><strong>{item.name}</strong><div className="match-date">{item.format.replace('-', ' ')} · {item.maxTeams} team capacity · /{item.slug}</div></div><div className="actions"><span className={`tag ${item.status === 'active' ? 'live' : ''}`}>{item.status}</span><button className="btn small secondary" onClick={() => edit(item)} data-testid={`button-edit-tournament-${item.id}`}>Edit</button></div></div>) : <Empty title="A new competition starts here" detail="Add a tournament using the form." />}</section>
  </div><Feedback message={notice} /></>;
}

function AdminTeams() {
  const qc = useQueryClient();
  const tournamentsQuery = useListTournaments();
  const tournaments = tournamentsQuery.data || [];
  const [tournamentId, setTournamentId] = useState('');
  const current = tournamentId || tournaments[0]?.id || '';
  const query = useListTeams({ tournamentId: current }, { query: { enabled: !!current, queryKey: getListTeamsQueryKey({ tournamentId: current }) } });
  const create = useCreateTeam();
  const update = useUpdateTeam();
  const remove = useDeleteTeam();
  const [editing, setEditing] = useState('');
  const blank = { name: '', shortName: '', city: '', group: '', logoUrl: '' };
  const [form, setForm] = useState(blank);
  const { notice, notify } = useNotify();
  const updateField = (key: keyof typeof blank) => (value: string) => setForm((old) => ({ ...old, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (editing) update.mutate({ teamId: editing, data: form }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTeamsQueryKey({ tournamentId: current }) }); notify('Club details saved.'); setEditing(''); setForm(blank); }, onError: () => notify('Could not save club details.') }); else create.mutate({ data: { ...form, tournamentId: current } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTeamsQueryKey({ tournamentId: current }) }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); notify('Club registered.'); setForm(blank); }, onError: () => notify('Could not register this club.') }); };
  const beginEdit = (team: Team) => { setEditing(team.id); setForm({ name: team.name, shortName: team.shortName, city: team.city || '', group: team.group || '', logoUrl: team.logoUrl || '' }); };
  return <><div className="eyebrow">SQUAD REGISTRY</div><h1>Teams</h1><div className="subhead">Register clubs, assign groups and maintain club details.</div><div className="filterbar"><TournamentSelect tournaments={tournaments} value={current} onChange={setTournamentId} /></div><div className="grid-main" style={{ gridTemplateColumns: 'minmax(270px,.7fr) minmax(0,1.3fr)' }}>
    <form className="panel panel-body" onSubmit={submit}><h3 className="display" style={{ fontSize: 23, marginTop: 0 }}>{editing ? 'Edit club' : 'Register a club'}</h3><Field label="Club name" name="team-name" value={form.name} onChange={updateField('name')} required /><div className="form-grid"><Field label="Short name" name="team-shortname" value={form.shortName} onChange={updateField('shortName')} required /><Field label="City" name="team-city" value={form.city} onChange={updateField('city')} /><Field label="Group" name="team-group" value={form.group} onChange={updateField('group')} /><Field label="Logo URL" name="team-logo" value={form.logoUrl} onChange={updateField('logoUrl')} /></div><div className="actions"><button className="btn" disabled={!current || create.isPending || update.isPending}>{editing ? 'Save club' : 'Register club'}</button>{editing && <button className="btn secondary" type="button" onClick={() => { setEditing(''); setForm(blank); }}>Cancel</button>}</div></form>
    <section className="panel"><div className="panel-head"><h3>Registered clubs</h3><span className="tag">{query.data?.length || 0}</span></div>{query.isLoading ? <LoadingRows /> : query.isError ? <Failure retry={() => query.refetch()} /> : query.data?.length ? query.data.map((team) => <div className="list-card" key={team.id}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Crest team={team} /><div><strong>{team.name}</strong><div className="match-date">{team.shortName}{team.city ? ` · ${team.city}` : ''}{team.group ? ` · Group ${team.group}` : ''}</div></div></div><div className="actions"><button className="btn small secondary" onClick={() => beginEdit(team)}>Edit</button><button className="btn small danger" onClick={() => { if (window.confirm(`Remove ${team.name} from this tournament?`)) remove.mutate({ teamId: team.id }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTeamsQueryKey({ tournamentId: current }) }); notify('Club removed.'); }, onError: () => notify('Could not remove the club.') }); }} disabled={remove.isPending} data-testid={`button-delete-team-${team.id}`}>Remove</button></div></div>) : <Empty title="No clubs registered" detail="Add the first team to this competition." />}</section>
  </div><Feedback message={notice} /></>;
}

function AdminStages() {
  const qc = useQueryClient();
  const tournamentQuery = useListTournaments();
  const tournaments = tournamentQuery.data || [];
  const [selectedId, setSelectedId] = useState('');
  const tournamentId = selectedId || tournaments[0]?.id || '';
  const query = useListStages({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListStagesQueryKey({ tournamentId }) } });
  const teamsQuery = useListTeams({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListTeamsQueryKey({ tournamentId }) } });
  const create = useCreateStage();
  const complete = useCompleteStage();
  const [form, setForm] = useState({ name: '', type: 'league', order: '1' });
  const { notice, notify } = useNotify();
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate({ data: { tournamentId, name: form.name, type: form.type as 'league' | 'group' | 'knockout', order: Number(form.order) } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListStagesQueryKey({ tournamentId }) }); notify('Stage added.'); setForm({ name: '', type: 'league', order: String((query.data?.length || 0) + 2) }); }, onError: () => notify('Could not create this stage.') }); };
  const [qualification, setQualification] = useState<Record<string, string>>({});
  return <><div className="eyebrow">COMPETITION STRUCTURE</div><h1>Stages</h1><div className="subhead">Build the competition pathway and decide who advances.</div><div className="filterbar"><TournamentSelect tournaments={tournaments} value={tournamentId} onChange={setSelectedId} /></div><div className="grid-main" style={{ gridTemplateColumns: 'minmax(270px,.7fr) minmax(0,1.3fr)' }}>
    <form className="panel panel-body" onSubmit={submit}><h3 className="display" style={{ fontSize: 23, marginTop: 0 }}>Add a stage</h3><Field label="Stage name" name="stage-name" value={form.name} onChange={(value) => setForm((f) => ({ ...f, name: value }))} required /><div className="form-grid"><Field label="Stage type" name="stage-type" value={form.type} options={['league', 'group', 'knockout']} onChange={(value) => setForm((f) => ({ ...f, type: value }))} /><Field label="Order" name="stage-order" value={form.order} type="number" onChange={(value) => setForm((f) => ({ ...f, order: value }))} /></div><button className="btn" disabled={!tournamentId || create.isPending}><Plus size={14} /> Create stage</button></form>
    <section className="panel"><div className="panel-head"><h3>Stage sequence</h3><span className="tag">{query.data?.length || 0} stages</span></div>{query.isLoading ? <LoadingRows /> : query.isError ? <Failure retry={() => query.refetch()} /> : query.data?.length ? query.data.map((stage) => <div className="list-card" key={stage.id} style={{ alignItems: 'flex-start' }}><div style={{ flex: 1 }}><div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><strong>{String(stage.order).padStart(2, '0')} · {stage.name}</strong><span className="tag">{stage.type}</span><span className={`tag ${stage.status === 'active' ? 'live' : ''}`}>{stage.status}</span></div>{stage.status !== 'completed' && <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}><select aria-label={`Qualified teams for ${stage.name}`} multiple value={qualification[stage.id]?.split(',').filter(Boolean) || []} onChange={(event) => setQualification((old) => ({ ...old, [stage.id]: Array.from(event.target.selectedOptions, (option) => option.value).join(',') }))} style={{ minWidth: 180, minHeight: 65, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))', color: 'inherit', padding: 8 }} data-testid={`select-qualified-${stage.id}`}>{(teamsQuery.data || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><button className="btn small" onClick={() => complete.mutate({ stageId: stage.id, data: { qualifiedTeamIds: qualification[stage.id]?.split(',').filter(Boolean) || [] } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListStagesQueryKey({ tournamentId }) }); notify('Stage completed and qualifiers recorded.'); }, onError: () => notify('Could not complete stage.') })} disabled={complete.isPending}>Complete stage</button></div>}</div></div>) : <Empty title="No stages defined" detail="Add the first phase of your tournament." />}</section>
  </div><Feedback message={notice} /></>;
}

function AdminMatches() {
  const qc = useQueryClient();
  const tournamentsQuery = useListTournaments();
  const tournaments = tournamentsQuery.data || [];
  const [selectedId, setSelectedId] = useState('');
  const tournamentId = selectedId || tournaments[0]?.id || '';
  const teamsQuery = useListTeams({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListTeamsQueryKey({ tournamentId }) } });
  const stagesQuery = useListStages({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListStagesQueryKey({ tournamentId }) } });
  const query = useListMatches({ tournamentId }, { query: { enabled: !!tournamentId, queryKey: getListMatchesQueryKey({ tournamentId }) } });
  const create = useCreateMatch();
  const generate = useGenerateFixtures();
  const update = useUpdateMatch();
  const remove = useDeleteMatch();
  const eventCreate = useCreateMatchEvent();
  const [form, setForm] = useState({ stageId: '', homeTeamId: '', awayTeamId: '', round: '', kickoffAt: '', venue: '' });
  const [eventForm, setEventForm] = useState({ matchId: '', type: 'goal', minute: '1', teamId: '', playerName: '', detail: '' });
  const { notice, notify } = useNotify();
  const invalidate = () => { qc.invalidateQueries({ queryKey: getListMatchesQueryKey({ tournamentId }) }); qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); };
  const submitMatch = (event: FormEvent) => { event.preventDefault(); create.mutate({ data: { tournamentId, ...form, kickoffAt: form.kickoffAt ? new Date(form.kickoffAt).toISOString() : null } }, { onSuccess: () => { invalidate(); notify('Fixture scheduled.'); setForm((old) => ({ ...old, homeTeamId: '', awayTeamId: '', round: '', kickoffAt: '' })); }, onError: () => notify('Could not schedule this fixture.') }); };
  const handleGenerate = () => { if (!form.stageId) { notify('Select a stage before generating fixtures.'); return; } generate.mutate({ data: { tournamentId, stageId: form.stageId, kickoffAt: form.kickoffAt ? new Date(form.kickoffAt).toISOString() : null } }, { onSuccess: () => { invalidate(); notify('Fixtures generated.'); }, onError: () => notify('Could not generate fixtures.') }); };
  const patchMatch = (match: Match, data: { status?: 'scheduled' | 'live' | 'completed'; minute?: number; homeScore?: number; awayScore?: number }) => update.mutate({ matchId: match.id, data }, { onSuccess: () => { invalidate(); notify('Match updated.'); }, onError: () => notify('Could not update match.') });
  const submitEvent = (event: FormEvent) => { event.preventDefault(); eventCreate.mutate({ data: { ...eventForm, type: eventForm.type as 'goal' | 'yellow-card' | 'red-card' | 'substitution', minute: Number(eventForm.minute), teamId: eventForm.teamId || null } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListMatchEventsQueryKey({ matchId: eventForm.matchId }) }); invalidate(); notify('Match event added.'); setEventForm((old) => ({ ...old, playerName: '', detail: '' })); }, onError: () => notify('Could not add match event.') }); };
  return <><div className="eyebrow">MATCHDAY CONTROL</div><h1>Fixtures & scores</h1><div className="subhead">Generate a round, schedule individual games and update live match state.</div><div className="filterbar"><TournamentSelect tournaments={tournaments} value={tournamentId} onChange={setSelectedId} /></div><div className="grid-main" style={{ gridTemplateColumns: 'minmax(280px,.75fr) minmax(0,1.45fr)' }}>
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      <form className="panel panel-body" onSubmit={submitMatch}><h3 className="display" style={{ fontSize: 23, marginTop: 0 }}>Schedule a match</h3><div className="field"><label htmlFor="match-stage">Stage</label><select id="match-stage" required value={form.stageId} onChange={(e) => setForm((f) => ({ ...f, stageId: e.target.value }))} data-testid="select-match-stage"><option value="">Choose stage</option>{(stagesQuery.data || []).map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}</select></div><div className="field"><label htmlFor="home-team">Home club</label><select id="home-team" required value={form.homeTeamId} onChange={(e) => setForm((f) => ({ ...f, homeTeamId: e.target.value }))}><option value="">Choose club</option>{(teamsQuery.data || []).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></div><div className="field"><label htmlFor="away-team">Away club</label><select id="away-team" required value={form.awayTeamId} onChange={(e) => setForm((f) => ({ ...f, awayTeamId: e.target.value }))}><option value="">Choose club</option>{(teamsQuery.data || []).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></div><div className="form-grid"><Field label="Round" name="match-round" value={form.round} onChange={(v) => setForm((f) => ({ ...f, round: v }))} /><Field label="Kickoff" name="match-kickoff" type="datetime-local" value={form.kickoffAt} onChange={(v) => setForm((f) => ({ ...f, kickoffAt: v }))} /></div><Field label="Venue" name="match-venue" value={form.venue} onChange={(v) => setForm((f) => ({ ...f, venue: v }))} /><div className="actions"><button className="btn" disabled={create.isPending || !tournamentId}>Add fixture</button><button className="btn secondary" type="button" onClick={handleGenerate} disabled={generate.isPending || !form.stageId}>Generate round robin</button></div></form>
      <form className="panel panel-body" onSubmit={submitEvent}><h3 className="display" style={{ fontSize: 23, marginTop: 0 }}>Record an event</h3><div className="field"><label htmlFor="event-match">Match</label><select id="event-match" value={eventForm.matchId} required onChange={(e) => setEventForm((old) => ({ ...old, matchId: e.target.value }))}><option value="">Choose match</option>{(query.data || []).map((match) => <option value={match.id} key={match.id}>{teamsQuery.data?.find((team) => team.id === match.homeTeamId)?.shortName} v {teamsQuery.data?.find((team) => team.id === match.awayTeamId)?.shortName}</option>)}</select></div><div className="form-grid"><Field label="Event" name="event-type" value={eventForm.type} options={['goal', 'yellow-card', 'red-card', 'substitution']} onChange={(v) => setEventForm((old) => ({ ...old, type: v }))} /><Field label="Minute" name="event-minute" value={eventForm.minute} type="number" onChange={(v) => setEventForm((old) => ({ ...old, minute: v }))} /></div><div className="field"><label htmlFor="event-team">Club</label><select id="event-team" value={eventForm.teamId} onChange={(e) => setEventForm((old) => ({ ...old, teamId: e.target.value }))}><option value="">Unassigned</option>{(teamsQuery.data || []).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></div><div className="form-grid"><Field label="Player" name="event-player" value={eventForm.playerName} onChange={(v) => setEventForm((old) => ({ ...old, playerName: v }))} /><Field label="Detail" name="event-detail" value={eventForm.detail} onChange={(v) => setEventForm((old) => ({ ...old, detail: v }))} /></div><button className="btn" disabled={eventCreate.isPending}>Record event</button></form>
    </div>
    <section className="panel"><div className="panel-head"><h3>Match schedule</h3><span className="tag">{query.data?.length || 0} games</span></div>{query.isLoading ? <LoadingRows /> : query.isError ? <Failure retry={() => query.refetch()} /> : query.data?.length ? query.data.map((match) => {
      const home = teamsQuery.data?.find((team) => team.id === match.homeTeamId); const away = teamsQuery.data?.find((team) => team.id === match.awayTeamId);
      return <div className="list-card" key={match.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}><div style={{ flex: '1 1 210px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}><strong>{home?.shortName || home?.name || 'Home'} <span className="mono">{match.homeScore}–{match.awayScore}</span> {away?.shortName || away?.name || 'Away'}</strong><span className={`tag ${match.status === 'live' ? 'live' : ''}`}>{match.status}</span></div><div className="match-date">{match.round || 'Fixture'} · {match.kickoffAt ? new Date(match.kickoffAt).toLocaleString() : 'Kickoff pending'}</div><div className="actions" style={{ marginTop: 10 }}><button className="btn small secondary" onClick={() => patchMatch(match, { status: match.status === 'live' ? 'scheduled' : 'live', minute: match.minute || 1 })}>{match.status === 'live' ? 'Pause live' : 'Start live'}</button><button className="btn small secondary" onClick={() => patchMatch(match, { status: 'completed' })}>Finalize</button><button className="btn small danger" onClick={() => { if (window.confirm('Delete this fixture?')) remove.mutate({ matchId: match.id }, { onSuccess: () => { invalidate(); notify('Fixture deleted.'); }, onError: () => notify('Could not delete fixture.') }); }} disabled={remove.isPending}>Delete</button></div><form onSubmit={(e) => { e.preventDefault(); const formData = new FormData(e.currentTarget); patchMatch(match, { homeScore: Number(formData.get('homeScore')), awayScore: Number(formData.get('awayScore')), minute: Number(formData.get('minute')) }); }} style={{ display: 'flex', gap: 6, marginTop: 9, alignItems: 'center' }}><input aria-label="Home score" name="homeScore" type="number" min="0" defaultValue={match.homeScore} style={{ width: 54, padding: 6 }} /><span className="mono">:</span><input aria-label="Away score" name="awayScore" type="number" min="0" defaultValue={match.awayScore} style={{ width: 54, padding: 6 }} /><input aria-label="Match minute" name="minute" type="number" min="0" max="130" defaultValue={match.minute || 0} style={{ width: 58, padding: 6 }} /><button className="btn small" type="submit">Save score</button></form></div></div>;
    }) : <Empty title="No fixtures yet" detail="Choose a stage to generate fixtures or schedule a match manually." />}</section>
  </div><Feedback message={notice} /></>;
}

function AdminLogin() {
  const [setupToken, setSetupToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const setupStatus = useGetSetupStatus();
  const login = useLoginAdmin();
  const setup = useSetupAdmin();
  const [, setPath] = useLocation();
  const initialSetup = setupStatus.data?.setupRequired === true;
  const submit = (event: FormEvent) => { event.preventDefault(); setMessage(''); const callbacks = { onSuccess: () => setPath('/admin'), onError: () => setMessage(initialSetup ? 'Setup could not be completed. Check the setup token and try again.' : 'Sign in failed. Check your email and password.') }; if (initialSetup) setup.mutate({ data: { setupToken, email, password } }, callbacks); else login.mutate({ data: { email, password } }, callbacks); };
  return <main className="login-wrap"><section className="login-art"><Brand admin /><div><div className="eyebrow">BUILT FOR MATCHDAY</div><h1>Every detail.<br />Under control.</h1></div><div className="match-date">SECURE TOURNAMENT ADMINISTRATION</div></section><section className="login-box"><form className="login-form" onSubmit={submit}><div className="eyebrow">{initialSetup ? 'FIRST ADMINISTRATOR' : 'ADMIN ACCESS'}</div><h2>{initialSetup ? 'Set up your desk' : 'Welcome back'}</h2><p className="subhead">{initialSetup ? 'Create the first administrator account to begin managing competitions.' : 'Sign in to manage tournaments, teams and matchday.'}</p>{setupStatus.isLoading ? <LoadingRows /> : setupStatus.isError ? <Failure retry={() => setupStatus.refetch()} /> : <>{initialSetup && <div className="field"><label htmlFor="setup-token">One-time setup token</label><input id="setup-token" value={setupToken} onChange={(e) => setSetupToken(e.target.value)} required data-testid="input-setup-token" /></div>}<div className="field"><label htmlFor="admin-email">Email address</label><input id="admin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-admin-email" /></div><div className="field"><label htmlFor="admin-password">Password</label><input id="admin-password" type="password" autoComplete={initialSetup ? 'new-password' : 'current-password'} minLength={initialSetup ? 12 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="input-admin-password" /></div>{message && <div role="alert" className="tag" style={{ color: 'hsl(var(--destructive))', marginBottom: 15 }}>{message}</div>}<button className="btn" style={{ width: '100%' }} disabled={login.isPending || setup.isPending}>{initialSetup ? 'Create administrator' : 'Sign in securely'}</button></>}<div style={{ marginTop: 24, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}><Link href="/" className="tag"><ChevronRight size={12} /> Return to public site</Link></div></form></section></main>;
}

function AppRoutes() {
  return <Switch>
    <Route path="/" component={HomePage} />
    <Route path="/tournament/:slug" component={TournamentPage} />
    <Route path="/standings" component={StandingsPage} />
    <Route path="/fixtures" component={() => <MatchesPage mode="fixtures" />} />
    <Route path="/results" component={() => <MatchesPage mode="results" />} />
    <Route path="/live" component={() => <MatchesPage mode="live" />} />
    <Route path="/teams" component={TeamsPage} />
    <Route path="/bracket" component={BracketPage} />
    <Route path="/match/:id" component={MatchPage} />
    <Route path="/admin/login" component={AdminLogin} />
    <Route path="/admin" component={() => <AdminGate><AdminHome /></AdminGate>} />
    <Route path="/admin/tournaments" component={() => <AdminGate><AdminTournaments /></AdminGate>} />
    <Route path="/admin/teams" component={() => <AdminGate><AdminTeams /></AdminGate>} />
    <Route path="/admin/stages" component={() => <AdminGate><AdminStages /></AdminGate>} />
    <Route path="/admin/matches" component={() => <AdminGate><AdminMatches /></AdminGate>} />
    <Route component={NotFound} />
  </Switch>;
}

function RealtimeSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    const refreshTournamentData = () => {
      void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetStandingsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListMatchEventsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListStagesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListTournamentsQueryKey() });
    };
    socket.on('connect', refreshTournamentData);
    socket.on('match:updated', refreshTournamentData);
    socket.on('fixtures:generated', refreshTournamentData);
    socket.on('stage:updated', refreshTournamentData);
    return () => {
      socket.off('connect', refreshTournamentData);
      socket.off('match:updated', refreshTournamentData);
      socket.off('fixtures:generated', refreshTournamentData);
      socket.off('stage:updated', refreshTournamentData);
      socket.disconnect();
    };
  }, [queryClient]);
  return null;
}

function App() {
  return <QueryClientProvider client={queryClient}><RealtimeSync /><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AppRoutes /></WouterRouter></QueryClientProvider>;
}

export default App;
