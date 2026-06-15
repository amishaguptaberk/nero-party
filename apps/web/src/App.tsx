import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Copy, Crown, Eye, Heart, Lock, Music2, Play, Plus, Search, SkipForward, X } from "lucide-react";
import { io } from "socket.io-client";
import { api, API_URL } from "./lib/api";
import type { PartySnapshot, Track } from "./lib/types";

const socket = io(API_URL, { autoConnect: false });

// Illustrative reactions for the landing preview marquee only (clearly a looping showcase, not live data).
const SAMPLE_REACTIONS = [
  { name: "Theo", text: "this one goes hard" },
  { name: "Priya", text: "turn it up" },
  { name: "Jules", text: "no skips tonight" },
  { name: "Sam", text: "vibes immaculate" },
  { name: "Devon", text: "cheered +5" },
  { name: "Kai", text: "run it back" },
];

// Real livestream activity, derived from consecutive snapshots — joins, now-playing, and queue adds.
function deriveActivity(prev: PartySnapshot | null, next: PartySnapshot): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const prevPeople = new Set(prev.participants.map((p) => p.id));
  for (const person of next.participants) if (!prevPeople.has(person.id)) out.push(`${person.name} joined the room`);
  if (prev.status !== "LIVE" && next.status === "LIVE") out.push("the stream is live");
  if (next.currentItem && next.currentItem.id !== prev.currentItem?.id) out.push(`now playing · ${next.currentItem.track.title}`);
  const prevQueue = new Set(prev.queue.map((item) => item.id));
  for (const item of next.queue) if (!prevQueue.has(item.id) && item.id !== prev.currentItem?.id) out.push(`${item.addedByName ?? "someone"} added ${item.track.title}`);
  return out;
}

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
      <div className="np-wave">{Array.from({ length: 92 }).map((_, i) => <span key={i} style={{ height: `${10 + Math.abs(Math.sin(i * 0.7)) * 78}%`, animationDelay: `${(i % 9) * 0.05}s` }} />)}</div>
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<"landing" | "create" | "join" | "lobby" | "live" | "reveal">("landing");
  const [createStep, setCreateStep] = useState(0);
  const [party, setParty] = useState<PartySnapshot | null>(null);
  const [joinPreview, setJoinPreview] = useState<PartySnapshot | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [hostName] = useState("Mia");
  const [partyName, setPartyName] = useState("Rooftop Revels");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [maxSongs, setMaxSongs] = useState(12);
  const [customSongs, setCustomSongs] = useState(16);
  const [maxMinutes] = useState(45);
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [previewError, setPreviewError] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [floats, setFloats] = useState<Array<{ id: number; left: number; size: number; dx: number; dur: number }>>([]);
  const [pendingCheers, setPendingCheers] = useState(0);
  const [cheerId, setCheerId] = useState(0);
  const [activity, setActivity] = useState<Array<{ id: number; text: string }>>([]);
  const floatIdRef = useRef(0);
  const activityIdRef = useRef(0);
  const prevSnapshotRef = useRef<PartySnapshot | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0, active: false, hover: false });
  const audioRef = useRef<HTMLAudioElement>(null);
  const magneticControlRef = useRef<HTMLElement | null>(null);

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
      setScreen("join");
    }
  }, []);

  useEffect(() => {
    if (screen !== "join") return;
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setJoinPreview(null);
      return;
    }
    let cancelled = false;
    api.getParty(code)
      .then((snapshot) => { if (!cancelled) setJoinPreview(snapshot); })
      .catch(() => { if (!cancelled) setJoinPreview(null); });
    return () => { cancelled = true; };
  }, [screen, joinCode]);

  useEffect(() => {
    if (!party?.code) return;
    socket.connect();
    socket.emit("party:join-room", { code: party.code });
    const handleSnapshot = (snapshot: PartySnapshot) => {
      const events = deriveActivity(prevSnapshotRef.current, snapshot);
      if (events.length) setActivity((current) => [...current, ...events.map((text) => ({ id: ++activityIdRef.current, text }))].slice(-50));
      prevSnapshotRef.current = snapshot;
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
    setPreviewError(false);
    if (!audio || !party?.currentItem) return;
    audio.src = party.currentItem.track.previewUrl;
    if (party.currentStartedAt) {
      const elapsed = Math.max(0, (Date.now() - new Date(party.currentStartedAt).getTime()) / 1000);
      audio.currentTime = Math.min(elapsed, 29);
    }
    audio.play().catch(() => undefined);
  }, [party?.currentItem?.id, party?.currentStartedAt]);

  useEffect(() => {
    if (showAdd) setSearchState("idle");
  }, [showAdd]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [activity]);

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
    setSearchState("loading");
    try {
      setTracks(await api.searchTracks(query));
      setSearchState("done");
    } catch {
      setTracks([]);
      setSearchState("error");
    }
  }

  function handlePreviewError() {
    if (!party?.currentItem) return;
    setPreviewError(true);
    if (isHost) run(() => refresh(api.advance(party.code)));
  }

  async function refresh(snapshot: Promise<PartySnapshot>) {
    setParty(await snapshot);
  }

  function copyInvite() {
    if (party?.code) navigator.clipboard?.writeText(`${window.location.origin}?party=${party.code}`);
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

  async function addTrackToParty(track: Track) {
    if (!party) return;
    await run(async () => {
      await refresh(api.addTrack(party.code, participantId, track));
      setShowAdd(false);
    });
  }

  function spawnFloats(count: number, baseLeft = 50) {
    const additions = Array.from({ length: count }, () => {
      const id = ++floatIdRef.current;
      window.setTimeout(() => setFloats((current) => current.filter((float) => float.id !== id)), 4200);
      return {
        id,
        left: baseLeft + (Math.random() * 16 - 8),
        size: 16 + ((Math.random() * 16) | 0),
        dx: (Math.random() * 60 - 30) | 0,
        dur: 2.6 + Math.random() * 1.4,
      };
    });
    setFloats((current) => [...current.slice(-26), ...additions]);
  }

  // Optimistic cheer: bump the count + fire the pink burst immediately, reconcile on snapshot, roll back on reject.
  function cheer() {
    if (!party?.currentItem) return;
    const code = party.code;
    setCheerId((value) => value + 1);
    setPendingCheers((value) => value + 1);
    spawnFloats(1 + ((Math.random() * 3) | 0));
    api.cheer(code, participantId)
      .then((snapshot) => setParty(snapshot))
      .catch(() => undefined)
      .finally(() => setPendingCheers((value) => Math.max(0, value - 1)));
  }

  function useCustomSongLimit() {
    setMaxSongs(Math.max(3, Math.min(50, customSongs)));
    setCreateStep(2);
  }

  function releaseMagneticControl() {
    const control = magneticControlRef.current;
    if (!control) return;
    control.removeAttribute("data-magnetic");
    control.style.removeProperty("--np-magnet-x");
    control.style.removeProperty("--np-magnet-y");
    magneticControlRef.current = null;
  }

  function updateMagneticControl(event: PointerEvent<HTMLElement>) {
    if (window.matchMedia("(pointer: coarse)").matches) return false;

    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled)"));
    const closest = controls.reduce<{ control: HTMLElement | null; distance: number }>((best, control) => {
      const rect = control.getBoundingClientRect();
      const dx = event.clientX < rect.left ? rect.left - event.clientX : event.clientX > rect.right ? event.clientX - rect.right : 0;
      const dy = event.clientY < rect.top ? rect.top - event.clientY : event.clientY > rect.bottom ? event.clientY - rect.bottom : 0;
      const distance = Math.hypot(dx, dy);
      return distance < best.distance ? { control, distance } : best;
    }, { control: null, distance: 56 });

    if (!closest.control) {
      releaseMagneticControl();
      return false;
    }

    const rect = closest.control.getBoundingClientRect();
    const x = Math.max(-9, Math.min(9, ((event.clientX - (rect.left + rect.width / 2)) / rect.width) * 18));
    const y = Math.max(-7, Math.min(7, ((event.clientY - (rect.top + rect.height / 2)) / rect.height) * 14));

    if (magneticControlRef.current && magneticControlRef.current !== closest.control) {
      releaseMagneticControl();
    }

    closest.control.dataset.magnetic = "true";
    closest.control.style.setProperty("--np-magnet-x", `${x}px`);
    closest.control.style.setProperty("--np-magnet-y", `${y}px`);
    magneticControlRef.current = closest.control;
    return true;
  }

  return (
    <main
      className="np"
      onPointerEnter={(event) => setCursor({ x: event.clientX, y: event.clientY, active: true, hover: false })}
      onPointerLeave={() => {
        releaseMagneticControl();
        setCursor((current) => ({ ...current, active: false, hover: false }));
      }}
      onPointerMove={(event) => {
        const target = event.target as HTMLElement;
        const nearControl = updateMagneticControl(event);
        setCursor({
          x: event.clientX,
          y: event.clientY,
          active: true,
          hover: nearControl || Boolean(target.closest("button, input, audio")),
        });
      }}
    >
      <div
        className={["np-cursor", cursor.active ? "show" : "", cursor.hover ? "hover" : ""].join(" ")}
        style={{ left: cursor.x, top: cursor.y }}
      >
        <span />
      </div>
      {screen !== "live" && screen !== "reveal" && <Backdrop />}
      {screen !== "join" && <div className="np-progress">{["landing", "create", "lobby", "live", "reveal"].map((name, i) => <span key={name} className={i <= ["landing", "create", "lobby", "live", "reveal"].indexOf(screen) ? "on" : ""} />)}</div>}

      {screen === "landing" && (
        <section className="np-screen">
          <header className="np-top"><Logo /></header>
          <div className="np-hero">
            <div className="np-hero-copy">
              <p className="np-kicker">submit · react · crown a winner</p>
              <h1>queue it.<br /><span className="pink">cheer it.</span><br /><b>crown it.</b></h1>
              <p className="np-sub">Drop a song in the queue, react in real time, and the most-loved track gets crowned song of the night.</p>
              <div className="np-actions">
                <button className="np-btn pink" onClick={() => setScreen("create")}>start a party <ArrowRight size={19} /></button>
                <button className="np-btn ghost" onClick={() => { setJoinCode(""); setJoinPreview(null); setScreen("join"); }}>join with a code</button>
              </div>
            </div>
            <div className="np-preview">
              <div className="np-preview-now">
                <div className="np-preview-disc"><AlbumTile size={52} round="50%" /></div>
                <div className="np-preview-meta"><p><span className="np-live-dot" /> now streaming</p><b>Midnight Overpass</b><span>The Velour Cassettes</span></div>
                <span className="np-preview-tag">live</span>
              </div>
              <div className="np-marquee">
                <div className="np-marquee-track">
                  {[...SAMPLE_REACTIONS, ...SAMPLE_REACTIONS].map((reaction, i) => (
                    <div className="np-chat-line" key={i}><Avatar name={reaction.name} size={24} /><span><b>{reaction.name}</b> {reaction.text}</span></div>
                  ))}
                </div>
              </div>
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
              <h2>what should<br />we call it?</h2>
              <input className="np-big-input" value={partyName} onChange={(event) => setPartyName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && partyName.trim() && setCreateStep(1)} autoFocus />
              <div className="np-actions"><button className="np-btn pink" onClick={() => setCreateStep(1)} disabled={!partyName.trim()}>continue <ArrowRight size={19} /></button><span className="np-help">press enter ↵</span></div>
            </>}
            {createStep === 1 && <>
              <h2>how many songs<br />can join?</h2>
              <div className="np-choice-row">{[7, 14, 21, 50].map((value) => <button key={value} className="np-choice" onClick={() => { setMaxSongs(value); setCreateStep(2); }}><b>{value === 50 ? "∞" : value}</b><span>{value === 50 ? "up to 50" : "songs"}</span></button>)}
                <div className="np-choice custom">
                  <input aria-label="Custom song limit" type="number" min={3} max={50} value={customSongs} onFocus={(event) => event.currentTarget.select()} onChange={(event) => setCustomSongs(Math.max(3, Math.min(50, Number(event.target.value) || 3)))} />
                  <span>custom songs</span>
                  <button onClick={useCustomSongLimit}>set</button>
                </div>
              </div>
            </>}
            {createStep === 2 && <>
              <h2>full songs or<br />30-second battle?</h2>
              <div className="np-choice-row">
                <button className="np-choice wide" onClick={createParty}><Music2 /><b>full songs</b><span>play tracks all the way through</span></button>
                <button className="np-choice wide" onClick={createParty}><Play /><b>30-second battle</b><span>fast rounds, quick cheers</span></button>
              </div>
            </>}
            {message && <p className="np-error">{message}</p>}
          </div>
        </section>
      )}

      {screen === "join" && (
        <section className="np-screen">
          <header className="np-top"><Logo /><button className="np-back" onClick={() => setScreen("landing")}><ArrowLeft size={15} /> back</button></header>
          <div className="np-join">
            {joinPreview ? <>
              <p className="np-kicker">you're invited</p>
              <h2>{joinPreview.name}</h2>
              <p className="np-join-host">hosted by {joinPreview.hostName}</p>
              <div className="np-join-avatars">{joinPreview.participants.slice(0, 8).map((person) => <Avatar key={person.id} name={person.name} size={44} host={person.isHost} />)}<span>{joinPreview.participants.length} already in the room</span></div>
            </> : <>
              <p className="np-kicker">join a party</p>
              <h2>got a code?</h2>
              <input className="np-big-input" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="party code" maxLength={6} autoFocus />
              <p className="np-help">ask the host for the 6-letter code</p>
            </>}
            <div className="np-join-form">
              <input value={joinName} onChange={(event) => setJoinName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && joinParty()} placeholder="what should we call you?" />
              <button className="np-btn pink" onClick={joinParty} disabled={busy || joinCode.trim().length !== 6 || !joinName.trim()}>join the party <ArrowRight size={19} /></button>
            </div>
            {message && <p className="np-error">{message}</p>}
          </div>
        </section>
      )}

      {screen === "lobby" && party && (
        <section className="np-screen">
          <header className="np-top"><Logo /><div className="np-top-right"><span className="np-soon">{party.participants.length} in the room</span><button className="np-copy" onClick={copyInvite}><Copy size={14} /> copy invite</button></div></header>
          <div className="np-lobby-title"><p>hosted by {party.hostName}</p><h2>{party.name.split(" ")[0]} <b>{party.name.split(" ").slice(1).join(" ")}</b></h2><span>everyone's tuning in. start the stream and the queue fills as it plays.</span></div>
          <div className="np-lobby-people"><p><b>{party.participants.length}</b> tuning in</p><div>{party.participants.map((person) => <span key={person.id}><Avatar name={person.name} size={62} host={person.isHost} />{person.name}{person.isHost && <em>HOST</em>}</span>)}</div></div>
          <div className="np-lobby-bottom">
            <span className="np-lobby-hint">the room adds songs and cheers live — go when it feels ready</span>
            {isHost
              ? <button className="np-btn gold" onClick={goLive} disabled={busy}>go live <ArrowRight size={18} /></button>
              : <span className="np-help">waiting for {party.hostName} to start the stream</span>}
          </div>
        </section>
      )}

      {screen === "live" && party && (
        <section className="np-live-screen">
          <header className="np-live-top"><div><Logo /><span className="np-divider" /><b>{party.name}</b><span className="np-live">LIVE</span></div><div>{party.participants.slice(0, 5).map((p) => <Avatar key={p.id} name={p.name} size={30} host={p.isHost} />)}<span><Eye size={15} />{party.participants.length}</span></div></header>
          <div className="np-now">
            <p className="np-kicker">NOW PLAYING</p>
            <div className="np-now-main"><AlbumTile track={party.currentItem?.track} size={216} round={16} /><div><h2>{party.currentItem?.track.title ?? "waiting for the first drop"}</h2><p>{party.currentItem?.track.artist ?? "add a song, then play the room"}</p><small>ADDED BY {(party.currentItem?.addedByName ?? party.hostName).toUpperCase()}</small><div className={party.currentItem ? "np-bars playing" : "np-bars"}>{Array.from({ length: 52 }).map((_, i) => <span key={i} className={i / 52 <= playbackProgress ? "played" : ""} style={{ animationDelay: `${(i % 8) * 0.08}s` }} />)}</div></div></div>
            <div className="np-cheer">
              <div className="np-floats">{floats.map((float) => <Heart key={float.id} className="np-float" size={float.size} fill="currentColor" style={{ left: `${float.left}%`, "--dx": `${float.dx}px`, "--dur": `${float.dur}s` } as CSSProperties} />)}</div>
              <button key={cheerId} className="np-cheer-btn" disabled={!party.currentItem} onClick={cheer}>
                {cheerId > 0 && <span className="np-cheer-ripple" aria-hidden />}
                <Heart className="np-cheer-heart" size={26} fill="#fff" />
                <span>cheer</span>
              </button>
              <div className="np-cheer-meter"><b key={cheerId} className="np-cheer-count">{(party.currentItem?.cheers ?? 0) + pendingCheers}</b><span>cheers</span></div>
            </div>
            {isHost && <button className="np-skip-inline" onClick={() => run(() => refresh(api.advance(party.code)))}><SkipForward size={15} /> skip to next song</button>}
            <p className="np-sealed"><Lock size={13} /> standings sealed</p>
            <p className="np-sealed-cap">standings unlock when the stream ends</p>
            {previewError && <p className="np-preview-error">this preview won't play — skipping</p>}
          </div>
          <aside className="np-side">
            <div className="np-queue-head"><span>UP NEXT · {party.queue.length}</span><button onClick={() => setShowAdd(true)}><Plus size={14} /> add song</button></div>
            <div className="np-queue">{party.queue.length === 0
              ? <p className="np-queue-empty">queue's open — add a track and it lines up here.</p>
              : party.queue.map((item, i) => <div key={item.id} className="np-q-row"><b>{i + 1}</b><AlbumTile track={item.track} size={42} round={8} /><span><strong>{item.track.title}</strong><em>{item.track.artist} · {item.addedByName}</em></span>{isHost && <button className="np-play-now" onClick={() => run(() => refresh(api.jump(party.code, item.id)))}><Play size={12} />play</button>}<button className="np-vote" onClick={() => run(() => refresh(api.vote(party.code, participantId, item.id)))}><ArrowUp size={14} /><b>{item.votes}</b></button></div>)}</div>
            <div className="np-feed">
              <p className="np-feed-head"><span className="np-live-dot" /> live activity</p>
              <div className="np-feed-list" ref={feedRef}>
                {activity.length === 0
                  ? (party.participants.length <= 1
                      ? <div className="np-feed-solo"><span>just you so far — share the code to fill the room</span><button className="np-copy" onClick={copyInvite}><Copy size={14} /> copy invite</button></div>
                      : <p className="np-feed-empty">joins, song adds, and now-playing stream in here as the room moves.</p>)
                  : activity.map((item) => <div key={item.id} className="np-feed-item"><span className="np-feed-dot" /><span>{item.text}</span></div>)}
              </div>
            </div>
          </aside>
          {isHost && <button className="np-reveal-btn" onClick={reveal}>end the stream & reveal <ArrowRight size={16} /></button>}
          <audio ref={audioRef} className="np-audio" controls onError={handlePreviewError} />
        </section>
      )}

      {screen === "reveal" && party && (
        <section className="np-reveal">
          {Array.from({ length: 70 }).map((_, i) => <span key={i} className="np-confetti" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${i * 0.13}s` }} />)}
          <div className="np-crown"><Crown size={58} /><p>we just crowned a champion</p><h2>song of the <b>night</b></h2></div>
          <div className="np-winner"><AlbumTile track={party.winner ?? undefined} size={230} round={14} /><div><h3>{party.winner?.title ?? "no winner yet"}</h3><p>{party.winner?.artist}</p><span><Heart size={19} /> <b>{party.winner?.cheers ?? 0}</b> cheers</span>{party.winner && <p className="np-breakdown">cheers {party.winner.cheers} ×3 · upvotes {party.winner.queueUpvotes} ×2 · unique cheerers {party.winner.uniqueCheerers} ×5 = {party.winner.score}</p>}</div></div>
          <div className="np-runners">{party.standings?.slice(1, 3).map((score, i) => <div key={score.queueItemId}><b>{i + 2}</b><AlbumTile track={score} size={44} round={9} /><span>{score.title}<em>{score.artist}</em></span><small><Heart size={14} />{score.cheers}</small></div>)}</div>
          <button className="np-btn pink np-runback" onClick={() => { setParty(null); setScreen("landing"); }}>run it back <ArrowRight size={17} /></button>
        </section>
      )}
      {party && showAdd && <AddSongModal query={query} setQuery={setQuery} tracks={tracks} search={search} close={() => setShowAdd(false)} add={addTrackToParty} state={searchState} />}
    </main>
  );
}

function AddSongModal({ query, setQuery, tracks, search, close, add, state }: { query: string; setQuery: (value: string) => void; tracks: Track[]; search: () => void; close: () => void; add: (track: Track) => void; state: "idle" | "loading" | "done" | "error" }) {
  return (
    <div className="np-modal" onClick={close}>
      <div onClick={(event) => event.stopPropagation()}>
        <header><h2>add a song</h2><button onClick={close}><X /></button></header>
        <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && search()} placeholder="search a track to drop in the queue..." /><button onClick={search}>search</button></label>
        <section>
          {state === "loading" ? <p className="np-modal-note">searching…</p>
            : state === "error" ? <p className="np-modal-note">couldn't reach search right now. try again.</p>
            : state === "done" && tracks.length === 0 ? <p className="np-modal-note">nothing for "{query}". try another title or artist.</p>
            : tracks.map((track) => <button key={track.providerId} onClick={() => add(track)}><AlbumTile track={track} size={44} round={8} /><span><b>{track.title}</b><em>{track.artist}</em></span><small><Plus size={15} /> add</small></button>)}
        </section>
      </div>
    </div>
  );
}
