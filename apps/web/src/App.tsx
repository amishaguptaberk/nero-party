import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Copy, Crown, Heart, Music2, Play, Radio, Search, SkipForward, Users } from "lucide-react";
import { io } from "socket.io-client";
import { api, API_URL } from "./lib/api";
import type { PartySnapshot, Track } from "./lib/types";

const socket = io(API_URL, { autoConnect: false });

function pickParticipant(party: PartySnapshot, name: string, host = false) {
  return [...party.participants].reverse().find((person) => person.name === name && (!host || person.isHost)) ?? party.participants.at(-1);
}

function Art({ track, size = "lg" }: { track?: { artworkUrl?: string | null; title?: string; artist?: string }; size?: "sm" | "lg" }) {
  const classes = size === "sm" ? "h-12 w-12" : "h-48 w-48 md:h-60 md:w-60";
  if (track?.artworkUrl) {
    return <img src={track.artworkUrl} alt="" className={`${classes} shrink-0 rounded-md object-cover shadow-2xl shadow-pink-950/30`} />;
  }
  return (
    <div className={`${classes} grid shrink-0 place-items-center rounded-md bg-nero-pink text-white`}>
      <Music2 className={size === "sm" ? "h-5 w-5" : "h-16 w-16"} />
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-nero-pink to-nero-violet shadow-lg shadow-pink-950/40">
        <Radio className="h-5 w-5" />
      </div>
      <span className="text-3xl font-black lowercase tracking-tight">nero</span>
    </div>
  );
}

export function App() {
  const [party, setParty] = useState<PartySnapshot | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [hostName, setHostName] = useState("Mia");
  const [partyName, setPartyName] = useState("Rooftop Revels");
  const [joinName, setJoinName] = useState("Theo");
  const [joinCode, setJoinCode] = useState("");
  const [maxSongs, setMaxSongs] = useState(12);
  const [maxMinutes, setMaxMinutes] = useState(45);
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const participant = useMemo(() => party?.participants.find((person) => person.id === participantId), [party, participantId]);
  const isHost = Boolean(participant?.isHost);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("party");
    if (code) setJoinCode(code.toUpperCase());
  }, []);

  useEffect(() => {
    if (!party?.code) return;
    socket.connect();
    socket.emit("party:join-room", { code: party.code });
    socket.on("party:snapshot", setParty);
    return () => {
      socket.off("party:snapshot", setParty);
    };
  }, [party?.code]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !party?.currentItem) return;
    audio.src = party.currentItem.track.previewUrl;
    if (party.currentStartedAt) {
      const elapsed = Math.max(0, (Date.now() - new Date(party.currentStartedAt).getTime()) / 1000);
      audio.currentTime = Math.min(elapsed, 29);
    }
    audio.play().catch(() => undefined);
  }, [party?.currentItem?.id, party?.currentStartedAt]);

  async function run(action: () => Promise<void>) {
    try {
      setBusy(true);
      setMessage("");
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function createParty() {
    await run(async () => {
      const next = await api.createParty({ name: partyName, hostName, maxSongs, maxMinutes });
      setParty(next);
      setParticipantId(pickParticipant(next, hostName, true)?.id ?? "");
      setJoinCode(next.code);
    });
  }

  async function joinParty() {
    await run(async () => {
      const next = await api.joinParty(joinCode.trim().toUpperCase(), joinName);
      setParty(next);
      setParticipantId(pickParticipant(next, joinName)?.id ?? "");
    });
  }

  async function search() {
    if (!query.trim()) return;
    await run(async () => setTracks(await api.searchTracks(query)));
  }

  async function refreshSnapshot(snapshot: Promise<PartySnapshot>) {
    const next = await snapshot;
    setParty(next);
  }

  if (!party) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-nero-bg text-nero-ink">
        <div className="nero-glow nero-glow-a" />
        <div className="nero-glow nero-glow-b" />
        <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
          <header className="flex items-center justify-between">
            <Logo />
            <span className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em]">live</span>
          </header>

          <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-nero-pink">Submit · react · crown a winner</p>
              <h1 className="mt-5 text-6xl font-black lowercase leading-none tracking-tight md:text-8xl">
                Queue it.
                <br />
                Cheer it.
                <br />
                <span className="text-nero-gold">Crown it.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-nero-dim">
                Drop iTunes preview tracks into a shared queue, listen together in real time, and reveal the song of the night.
              </p>
            </div>

            <div className="grid gap-4">
              <div className="nero-panel">
                <h2 className="text-2xl font-black lowercase">Start a party</h2>
                <div className="mt-4 grid gap-3">
                  <input className="nero-input" value={partyName} onChange={(event) => setPartyName(event.target.value)} />
                  <input className="nero-input" value={hostName} onChange={(event) => setHostName(event.target.value)} placeholder="Your name" />
                  <div className="grid grid-cols-2 gap-3">
                    <label className="nero-field">
                      <span>max songs</span>
                      <input type="number" value={maxSongs} min={3} max={50} onChange={(event) => setMaxSongs(Number(event.target.value))} />
                    </label>
                    <label className="nero-field">
                      <span>max mins</span>
                      <input type="number" value={maxMinutes} min={5} max={180} onChange={(event) => setMaxMinutes(Number(event.target.value))} />
                    </label>
                  </div>
                  <button className="nero-primary" disabled={busy} onClick={createParty}>
                    Start a party <Play className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="nero-panel">
                <h2 className="text-2xl font-black lowercase">Join a party</h2>
                <div className="mt-4 grid gap-3">
                  <input className="nero-input uppercase" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Room code" />
                  <input className="nero-input" value={joinName} onChange={(event) => setJoinName(event.target.value)} placeholder="Your name" />
                  <button className="nero-secondary" disabled={busy} onClick={joinParty}>
                    Join a party
                  </button>
                </div>
              </div>
              {message && <p className="text-sm text-nero-gold">{message}</p>}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-nero-bg text-nero-ink">
      <div className="nero-glow nero-glow-a" />
      <div className="nero-glow nero-glow-b" />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 md:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-5">
            <Logo />
            <div>
              <h1 className="text-xl font-black lowercase md:text-2xl">{party.name}</h1>
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-nero-dim">hosted by {party.hostName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="nero-chip" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}?party=${party.code}`)}>
              <Copy className="h-4 w-4" /> {party.code}
            </button>
            <span className="nero-chip">
              <Users className="h-4 w-4" /> {party.participants.length}
            </span>
            <span className="rounded-md bg-red-500 px-3 py-2 text-xs font-black uppercase tracking-[0.18em]">{party.status === "LOBBY" ? "GOING LIVE SOON" : party.status}</span>
          </div>
        </header>

        <div className="grid flex-1 gap-5 py-5 lg:grid-cols-[1fr_420px]">
          <section className="grid content-start gap-5">
            <div className="nero-panel">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-nero-pink">Now playing</p>
              <div className="mt-5 flex flex-col gap-6 md:flex-row">
                <Art track={party.currentItem?.track} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-5xl font-black lowercase leading-none md:text-7xl">
                    {party.currentItem?.track.title ?? "waiting for the first drop"}
                  </h2>
                  <p className="mt-3 text-xl text-nero-dim">{party.currentItem?.track.artist ?? "add songs, then go live"}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button className="nero-primary" disabled={!party.currentItem || !participantId} onClick={() => run(() => refreshSnapshot(api.cheer(party.code, participantId)))}>
                      <Heart className="h-5 w-5" /> CHEER <span className="font-mono opacity-80">+1</span>
                    </button>
                    <div className="min-w-20 text-center">
                      <div className="text-3xl font-black text-nero-gold">{party.currentItem?.cheers ?? 0}</div>
                      <div className="font-mono text-[11px] uppercase text-nero-dim">CHEERS</div>
                    </div>
                    {isHost && party.status === "LOBBY" && (
                      <button className="nero-secondary" onClick={() => run(() => refreshSnapshot(api.start(party.code)))}>
                        <Play className="h-5 w-5" /> GO LIVE
                      </button>
                    )}
                    {isHost && party.status === "LIVE" && (
                      <>
                        <button className="nero-secondary" onClick={() => run(() => refreshSnapshot(api.advance(party.code)))}>
                          <SkipForward className="h-5 w-5" /> Next
                        </button>
                        <button className="nero-gold" onClick={() => run(() => refreshSnapshot(api.end(party.code)))}>
                          <Crown className="h-5 w-5" /> End the stream & reveal
                        </button>
                      </>
                    )}
                  </div>
                  <audio ref={audioRef} className="mt-5 w-full" controls />
                  <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-nero-dim">Standings sealed until the stream ends</p>
                </div>
              </div>
            </div>

            {party.status === "ENDED" && (
              <div className="nero-panel border-nero-gold/40">
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-nero-gold">WE JUST CROWNED A CHAMPION</p>
                <h2 className="mt-3 text-5xl font-black lowercase text-nero-gold">SONG OF THE NIGHT</h2>
                <p className="mt-4 text-3xl font-black lowercase">{party.winner?.title ?? "No winner yet"}</p>
                <p className="mt-2 text-xl text-nero-dim">{party.winner?.artist}</p>
                <div className="mt-5 grid gap-2">
                  {party.standings?.map((score, index) => (
                    <div key={score.queueItemId} className="flex items-center justify-between bg-black/25 p-3">
                      <span>{index + 1}. {score.title}</span>
                      <span className="font-mono text-nero-gold">{score.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="grid content-start gap-5">
            <div className="nero-panel">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-nero-dim">Up next · {party.queue.length}/{party.maxSongs}</p>
              </div>
              <div className="mt-4 grid gap-2">
                {party.queue.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3 bg-white/[0.04] p-3">
                    <span className="w-5 text-center font-black text-nero-gold">{index + 1}</span>
                    <Art track={item.track} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{item.track.title}</p>
                      <p className="truncate text-sm text-nero-dim">{item.track.artist} · {item.addedByName}</p>
                    </div>
                    <button className="grid place-items-center rounded-md bg-white/10 px-3 py-2 text-nero-pink" onClick={() => run(() => refreshSnapshot(api.vote(party.code, participantId, item.id)))}>
                      <ArrowUp className="h-4 w-4" />
                      <span className="text-xs font-black">{item.votes}</span>
                    </button>
                  </div>
                ))}
                {!party.queue.length && <p className="py-8 text-center text-sm text-nero-dim">Search below and add the first song.</p>}
              </div>
            </div>

            <div className="nero-panel">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-nero-dim">Add a song</p>
              <div className="mt-4 flex gap-2">
                <input className="nero-input" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && search()} placeholder="Search a track to drop in the queue..." />
                <button className="nero-icon" onClick={search}>
                  <Search className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto">
                {tracks.map((track) => (
                  <button key={track.providerId} className="flex items-center gap-3 bg-white/[0.04] p-3 text-left hover:bg-white/[0.08]" onClick={() => run(() => refreshSnapshot(api.addTrack(party.code, participantId, track)))}>
                    <Art track={track} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{track.title}</span>
                      <span className="block truncate text-sm text-nero-dim">{track.artist}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="nero-panel">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-nero-dim">Tuned in</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {party.participants.map((person) => (
                  <span key={person.id} className="rounded-full bg-white/10 px-3 py-2 text-sm">
                    {person.name}{person.isHost ? " · host" : ""}
                  </span>
                ))}
              </div>
            </div>
            {message && <p className="text-sm text-nero-gold">{message}</p>}
          </aside>
        </div>
      </section>
    </main>
  );
}
