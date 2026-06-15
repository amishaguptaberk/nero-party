import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { ArrowRight, ArrowUp, Copy, Crown, Eye, Heart, Lock, Music2, Play, Plus, Search, SkipForward, Users, X } from "lucide-react";
import { io } from "socket.io-client";
import { api, API_URL } from "./lib/api";
import type { PartySnapshot, Track } from "./lib/types";

const socket = io(API_URL, { autoConnect: false });
const people = ["Mia", "Theo", "Priya", "Jules", "Sam", "Devon", "Kai"];

function pickParticipant(party: PartySnapshot, name: string, host = false) {
  return [...party.participants].reverse().find((person) => person.name === name && (!host || person.isHost)) ?? party.participants.at(-1);
}

function Logo() {
  return (
    <div className="np-logo">
      <span className="np-mark"><span /><span /><span /><span /></span>
      <span className="np-word">nero</span>
    </div>
  );
}

function Avatar({ name, host = false, size = 36 }: { name: string; host?: boolean; size?: number }) {
  return (
    <div className={host ? "np-avatar host" : "np-avatar"} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {name[0]}
    </div>
  );
}

function AlbumTile({ track, size = 52, round = 10 }: { track?: { artworkUrl?: string | null; title?: string }; size?: number; round?: number | string }) {
  if (track?.artworkUrl) return <img src={track.artworkUrl} alt="" className="np-art" style={{ width: size, height: size, borderRadius: round }} />;
  return (
    <div className="np-album" style={{ width: size, height: size, borderRadius: round }}>
      <Music2 size={size * 0.34} />
    </div>
  );
}

function Backdrop() {
  return (
    <div className="np-backdrop">
      <div className="np-glow-a" />
      <div className="np-glow-b" />
      <div className="np-scan" />
      <div className="np-wave">{Array.from({ length: 92 }).map((_, i) => <span key={i} style={{ height: `${10 + Math.abs(Math.sin(i * 0.7)) * 78}%`, animationDelay: `${(i % 9) * 0.05}s` }} />)}</div>
      {Array.from({ length: 12 }).map((_, i) => <Heart key={i} className="np-float-heart" size={14 + (i % 3) * 6} style={{ right: `${4 + (i * 7.3) % 40}%`, animationDelay: `${i * 0.7}s`, color: i % 3 ? "#ff2d7e" : "#ffcf4a" }} />)}
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<"landing" | "create" | "lobby" | "live" | "reveal">("landing");
  const [createStep, setCreateStep] = useState(0);
  const [party, setParty] = useState<PartySnapshot | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [hostName] = useState("Mia");
  const [partyName, setPartyName] = useState("Rooftop Revels");
  const [joinName, setJoinName] = useState("Theo");
  const [joinCode, setJoinCode] = useState("");
  const [maxSongs, setMaxSongs] = useState(12);
  const [maxMinutes] = useState(45);
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [magnetDirection, setMagnetDirection] = useState<"up" | "down" | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wheelLockRef = useRef(0);

  const participant = useMemo(() => party?.participants.find((person) => person.id === participantId), [party, participantId]);
  const isHost = Boolean(participant?.isHost);
  const playbackProgress = useMemo(() => {
    if (!party?.currentItem || !party.currentStartedAt) return 0;
    const durationMs = Math.min(party.currentItem.track.durationMs ?? 30_000, 30_000);
    const elapsedMs = Math.max(0, nowMs - new Date(party.currentStartedAt).getTime());
    return Math.min(1, elapsedMs / durationMs);
  }, [nowMs, party?.currentItem, party?.currentStartedAt]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("party");
    if (code) {
      setJoinCode(code.toUpperCase());
      setScreen("create");
    }
  }, []);

  useEffect(() => {
    if (!party?.code) return;
    socket.connect();
    socket.emit("party:join-room", { code: party.code });
    const handleSnapshot = (snapshot: PartySnapshot) => {
      setParty(snapshot);
      if (snapshot.status === "LIVE") setScreen("live");
      if (snapshot.status === "ENDED") setScreen("reveal");
    };
    socket.on("party:snapshot", handleSnapshot);
    return () => {
      socket.off("party:snapshot", handleSnapshot);
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

  useEffect(() => {
    if (party?.status !== "LIVE" || !party.currentItem) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [party?.status, party?.currentItem?.id]);

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
      setScreen("lobby");
    });
  }

  async function joinParty() {
    if (!joinCode.trim()) return;
    await run(async () => {
      const next = await api.joinParty(joinCode.trim().toUpperCase(), joinName);
      setParty(next);
      setParticipantId(pickParticipant(next, joinName)?.id ?? "");
      setScreen("lobby");
    });
  }

  async function search() {
    if (!query.trim()) return;
    await run(async () => setTracks(await api.searchTracks(query)));
  }

  async function refresh(snapshot: Promise<PartySnapshot>) {
    setParty(await snapshot);
  }

  async function goLive() {
    if (!party) return;
    await run(async () => {
      setParty(await api.start(party.code));
      setScreen("live");
    });
  }

  async function reveal() {
    if (!party) return;
    await run(async () => {
      setParty(await api.end(party.code));
      setScreen("reveal");
    });
  }

  function handleMagneticWheel(event: WheelEvent<HTMLElement>) {
    if (showAdd || Math.abs(event.deltaY) < 34) return;

    const now = Date.now();
    if (now - wheelLockRef.current < 620) return;

    const direction = event.deltaY > 0 ? "down" : "up";
    let moved = false;

    if (direction === "down") {
      if (screen === "landing") {
        setScreen("create");
        moved = true;
      } else if (screen === "create" && createStep < 2) {
        setCreateStep((step) => Math.min(2, step + 1));
        moved = true;
      }
    } else if (screen === "create") {
      if (createStep > 0) {
        setCreateStep((step) => Math.max(0, step - 1));
        moved = true;
      } else {
        setScreen("landing");
        moved = true;
      }
    }

    if (!moved) return;

    event.preventDefault();
    wheelLockRef.current = now;
    setMagnetDirection(direction);
    window.setTimeout(() => setMagnetDirection(null), 360);
  }

  return (
    <main className={magnetDirection ? `np magnet-${magnetDirection}` : "np"} onWheel={handleMagneticWheel}>
      {screen !== "live" && <Backdrop />}
      <div className="np-progress">{["landing", "create", "lobby", "live", "reveal"].map((name, i) => <span key={name} className={i <= ["landing", "create", "lobby", "live", "reveal"].indexOf(screen) ? "on" : ""} />)}</div>

      {screen === "landing" && (
        <section className="np-screen">
          <header className="np-top"><Logo /><div className="np-top-right"><span className="np-live">LIVE</span><span><Eye size={15} />1.2k watching</span></div></header>
          <div className="np-hero">
            <div className="np-hero-copy">
              <p className="np-kicker">SUBMIT · REACT · CROWN A WINNER</p>
              <h1>QUEUE IT.<br />CHEER IT.<br /><b>CROWN IT.</b></h1>
              <p className="np-sub">Drop a song in the queue, react in real time, and the most-loved track gets crowned Song of the Night.</p>
              <div className="np-avatars">{people.slice(0, 5).map((name, i) => <Avatar key={name} name={name} size={40} host={i === 0} />)}<span><b>7 friends</b> just tuned in</span></div>
              <div className="np-actions">
                <button className="np-btn pink" onClick={() => setScreen("create")}>Start a party <ArrowRight size={19} /></button>
                <button className="np-btn ghost" onClick={() => setScreen("create")}>Join a party</button>
              </div>
            </div>
            <div className="np-mini-chat">
              <div className="np-mini-now"><AlbumTile size={52} round="50%" /><div><p>● NOW STREAMING</p><b>Midnight Overpass</b><span>The Velour Cassettes</span></div></div>
              {["this one goes hard", "turn it UP", "no skips tonight", "vibes immaculate"].map((text, i) => <div className="np-chat-line" key={text}><Avatar name={people[i + 1]} size={24} /><span><b>{people[i + 1]}</b> {text}</span></div>)}
              <div className="np-chat-input"><Heart size={15} /> drop a reaction…</div>
            </div>
          </div>
        </section>
      )}

      {screen === "create" && (
        <section className="np-screen">
          <header className="np-top"><Logo /><div className="np-dots">{[0, 1, 2].map((i) => <span key={i} className={i === createStep ? "on" : ""} />)}<em>{createStep + 1} / 3</em></div></header>
          <div className="np-create">
            <p className="np-kicker">{["LET'S GO LIVE", "ALMOST THERE", "LAST ONE"][createStep]}</p>
            {createStep === 0 && <>
              <h2>What should<br />we call it?</h2>
              <input className="np-big-input" value={partyName} onChange={(event) => setPartyName(event.target.value)} />
              <div className="np-actions"><button className="np-btn pink" onClick={() => setCreateStep(1)}>Continue <ArrowRight size={19} /></button><span className="np-help">press enter ↵</span></div>
            </>}
            {createStep === 1 && <>
              <h2>How many songs<br />per person?</h2>
              <div className="np-choice-row">{[1, 2, 3, 12].map((value) => <button key={value} className="np-choice" onClick={() => { setMaxSongs(value === 12 ? 12 : value * 7); setCreateStep(2); }}><b>{value === 12 ? "∞" : value}</b><span>{value === 12 ? "no limit" : value === 1 ? "song" : "songs"}</span></button>)}</div>
            </>}
            {createStep === 2 && <>
              <h2>Full songs or<br />30-second battle?</h2>
              <div className="np-choice-row">
                <button className="np-choice wide" onClick={createParty}><Music2 /><b>Full songs</b><span>play tracks all the way through</span></button>
                <button className="np-choice wide" onClick={createParty}><Play /><b>30-second battle</b><span>fast rounds, quick cheers</span></button>
              </div>
            </>}
            <div className="np-waiting">{people.slice(0, 4).map((name) => <Avatar key={name} name={name} size={34} />)}<span><b>7 friends</b> are waiting to join</span></div>
            <div className="np-join-inline">
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Room code" />
              <input value={joinName} onChange={(event) => setJoinName(event.target.value)} placeholder="Your name" />
              <button onClick={joinParty}>Join</button>
            </div>
            {message && <p className="np-error">{message}</p>}
          </div>
        </section>
      )}

      {screen === "lobby" && party && (
        <section className="np-screen">
          <header className="np-top"><Logo /><div className="np-top-right"><span className="np-soon">GOING LIVE SOON</span><button className="np-copy" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}?party=${party.code}`)}><Copy size={14} /> Copy invite</button></div></header>
          <div className="np-lobby-title"><p>HOSTED BY {party.hostName.toUpperCase()}</p><h2>{party.name.split(" ")[0]?.toUpperCase()} <b>{party.name.split(" ").slice(1).join(" ").toUpperCase()}</b></h2><span>Viewers are tuning in. Go live whenever you're ready.</span></div>
          <div className="np-lobby-people"><p><b>{party.participants.length}</b> tuning in · and climbing</p><div>{party.participants.map((person) => <span key={person.id}><Avatar name={person.name} size={62} host={person.isHost} />{person.name}{person.isHost && <em>HOST</em>}</span>)}</div></div>
          <div className="np-lobby-bottom"><div><AlbumTile track={party.queue[0]?.track} size={52} /><span><em>FIRST UP</em><b>{party.queue[0]?.track.title ?? "Add a song from the live room"}</b><small>{party.queue[0]?.track.artist ?? "iTunes preview search is ready"}</small></span></div>{isHost && <button className="np-btn gold" onClick={goLive}>GO LIVE <ArrowRight size={18} /></button>}</div>
        </section>
      )}

      {screen === "live" && party && (
        <section className="np-live-screen">
          <header className="np-live-top"><div><Logo /><span className="np-divider" /><b>{party.name}</b><span className="np-live">LIVE</span></div><div>{party.participants.slice(0, 5).map((p) => <Avatar key={p.id} name={p.name} size={30} host={p.isHost} />)}<span><Eye size={15} />{party.participants.length}</span></div></header>
          <div className="np-now">
            <p className="np-kicker">NOW PLAYING</p>
            <div className="np-now-main"><AlbumTile track={party.currentItem?.track} size={216} round={16} /><div><h2>{party.currentItem?.track.title ?? "waiting for the first drop"}</h2><p>{party.currentItem?.track.artist ?? "add a song, then play the room"}</p><small>ADDED BY {(party.currentItem?.addedByName ?? party.hostName).toUpperCase()}</small><div className={party.currentItem ? "np-bars playing" : "np-bars"}>{Array.from({ length: 52 }).map((_, i) => <span key={i} className={i / 52 <= playbackProgress ? "played" : ""} style={{ animationDelay: `${(i % 8) * 0.08}s` }} />)}</div></div></div>
            <div className="np-cheer"><button className="np-btn pink" disabled={!party.currentItem} onClick={() => run(() => refresh(api.cheer(party.code, participantId)))}><Heart size={22} /> CHEER <em>+1</em></button><div><b>{party.currentItem?.cheers ?? 0}</b><span>CHEERS</span></div></div>
            {isHost && <button className="np-skip-inline" onClick={() => run(() => refresh(api.advance(party.code)))}><SkipForward size={15} /> skip to next song</button>}
            <p className="np-sealed"><Lock size={13} /> STANDINGS SEALED — REVEALED WHEN THE STREAM ENDS</p>
          </div>
          <aside className="np-side">
            <div className="np-queue-head"><span>UP NEXT · {party.queue.length}</span><button onClick={() => setShowAdd(true)}><Plus size={14} /> Add song</button></div>
            <div className="np-queue">{party.queue.map((item, i) => <div key={item.id} className="np-q-row"><b>{i + 1}</b><AlbumTile track={item.track} size={42} round={8} /><span><strong>{item.track.title}</strong><em>{item.track.artist} · {item.addedByName}</em></span>{isHost && <button className="np-play-now" onClick={() => run(() => refresh(api.jump(party.code, item.id)))}><Play size={12} />play</button>}<button className="np-vote" onClick={() => run(() => refresh(api.vote(party.code, participantId, item.id)))}><ArrowUp size={14} /><b>{item.votes}</b></button></div>)}</div>
            <div className="np-chat"><p>LIVE CHAT</p>{["this one goes hard", "turn it UP", "no skips tonight"].map((text, i) => <div key={text}><Avatar name={people[i + 1]} size={22} /><span><b>{people[i + 1]}</b> {text}</span></div>)}<div className="np-chat-input"><Heart size={15} /> say something…</div></div>
          </aside>
          {isHost && <button className="np-reveal-btn" onClick={reveal}>End the stream & reveal <ArrowRight size={16} /></button>}
          <audio ref={audioRef} className="np-audio" controls />
          {showAdd && <AddSongModal query={query} setQuery={setQuery} tracks={tracks} search={search} close={() => setShowAdd(false)} add={(track) => run(async () => { await refresh(api.addTrack(party.code, participantId, track)); setShowAdd(false); })} />}
        </section>
      )}

      {screen === "reveal" && party && (
        <section className="np-reveal">
          {Array.from({ length: 70 }).map((_, i) => <span key={i} className="np-confetti" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${i * 0.13}s` }} />)}
          <div className="np-crown"><Crown size={58} /><p>WE JUST CROWNED A CHAMPION</p><h2>SONG OF THE <b>NIGHT</b></h2></div>
          <div className="np-winner"><AlbumTile track={party.winner ?? undefined} size={230} round={14} /><div><h3>{party.winner?.title ?? "No winner yet"}</h3><p>{party.winner?.artist}</p><span><Heart size={19} /> <b>{party.winner?.cheers ?? 0}</b> cheers</span></div></div>
          <div className="np-runners">{party.standings?.slice(1, 3).map((score, i) => <div key={score.queueItemId}><b>{i + 2}</b><AlbumTile track={score} size={44} round={9} /><span>{score.title}<em>{score.artist}</em></span><small><Heart size={14} />{score.cheers}</small></div>)}</div>
          <button className="np-btn pink np-runback" onClick={() => { setParty(null); setScreen("landing"); }}>Run it back <ArrowRight size={17} /></button>
        </section>
      )}
    </main>
  );
}

function AddSongModal({ query, setQuery, tracks, search, close, add }: { query: string; setQuery: (value: string) => void; tracks: Track[]; search: () => void; close: () => void; add: (track: Track) => void }) {
  return (
    <div className="np-modal" onClick={close}>
      <div onClick={(event) => event.stopPropagation()}>
        <header><h2>Add a song</h2><button onClick={close}><X /></button></header>
        <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && search()} placeholder="Search a track to drop in the queue..." /><button onClick={search}>search</button></label>
        <section>{tracks.map((track) => <button key={track.providerId} onClick={() => add(track)}><AlbumTile track={track} size={44} round={8} /><span><b>{track.title}</b><em>{track.artist}</em></span><small><Plus size={15} /> add</small></button>)}</section>
      </div>
    </div>
  );
}
