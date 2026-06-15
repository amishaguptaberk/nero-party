import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type PointerEvent, type WheelEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Copy, Crown, Eye, Heart, Lock, Music2, Play, Plus, Search, SkipForward, X } from "lucide-react";
import { io } from "socket.io-client";
import { api, API_URL } from "./lib/api";
import type { PartySnapshot, Track } from "./lib/types";

const socket = io(API_URL, { autoConnect: false });
const people = ["Mia", "Theo", "Priya", "Jules", "Sam", "Devon", "Kai"];
const SESSION_KEY = "nero.session";

function saveSession(code: string, participantId: string) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ code, participantId }));
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function readSession(): { code: string; participantId: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readInviteCode(): string | null {
  const code = new URLSearchParams(window.location.search).get("party");
  return code ? code.toUpperCase() : null;
}

function parsePartyCodeFromInvite(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const paramMatch = trimmed.match(/[?&]party=([A-Za-z0-9]{6})\b/);
  if (paramMatch) return paramMatch[1].toUpperCase();

  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(trimmed, window.location.origin);
    const fromParam = url.searchParams.get("party");
    if (fromParam && /^[A-Za-z0-9]{6}$/.test(fromParam)) return fromParam.toUpperCase();
  } catch {
    // not a URL
  }

  const compact = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length === 6) return compact;

  return null;
}

function copyTextToClipboard(text: string): boolean {
  try {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "0";
    document.body.appendChild(input);
    input.focus();
    input.select();
    input.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(input);
    return copied;
  } catch {
    return false;
  }
}

// Drop ?party= after entry so refresh/HMR doesn't re-open the join screen.
function clearInviteParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("party")) return;
  url.searchParams.delete("party");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

// A human, music-focused line for the winner — chosen from the stats but never speaks "score".
function winnerSubtitle(winner: { uniqueCheerers: number; cheers: number; queueUpvotes: number }) {
  if (winner.uniqueCheerers >= 3) return "the whole room was in on this one";
  if (winner.cheers >= 5) return "this one hit different";
  if (winner.queueUpvotes >= 3) return "the queue believed in this one from the start";
  if (winner.cheers > 0 || winner.uniqueCheerers > 0) return "tonight's favorite takes the crown";
  return "the crown goes to the first one that moved the room";
}

function Logo() {
  return (
    <div className="np-logo">
      <span className="np-mark"><span /><span /><span /><span /></span>
      <span className="np-word">nero party</span>
    </div>
  );
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  const hue = hash;
  return `linear-gradient(150deg, hsl(${hue} 85% 60%), hsl(${(hue + 42) % 360} 80% 48%))`;
}

function Avatar({ name, host = false, size = 36 }: { name: string; host?: boolean; size?: number }) {
  return (
    <div className={host ? "np-avatar host" : "np-avatar"} style={{ width: size, height: size, fontSize: size * 0.38, background: avatarColor(name || "?") }}>
      {(name[0] ?? "?").toUpperCase()}
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

type PartyLoadingMode = "create" | "join" | "live" | "restore";

const PARTY_LOAD_LINES: Record<PartyLoadingMode, string[]> = {
  create: ["spinning up your room", "tuning the queue", "almost ready to build"],
  join: ["finding your party", "syncing everyone in the room", "hold tight — you're almost in"],
  live: ["going live", "dropping the first beat", "the room is waking up"],
  restore: ["reconnecting you", "picking up where you left off", "syncing the room"],
};

const PARTY_LOAD_KICKER: Record<PartyLoadingMode, string> = {
  create: "opening room",
  join: "joining room",
  live: "going live",
  restore: "reconnecting",
};

const ENTRY_MIN_MS = 1400;

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function PartyEntryLoader({ mode, partyName, partyCode }: { mode: PartyLoadingMode; partyName?: string; partyCode?: string }) {
  const [lineIndex, setLineIndex] = useState(0);
  const lines = PARTY_LOAD_LINES[mode];

  useEffect(() => {
    setLineIndex(0);
    const timer = window.setInterval(() => setLineIndex((value) => (value + 1) % lines.length), 2100);
    return () => window.clearInterval(timer);
  }, [lines.length, mode]);

  return (
    <div className="np-party-load" role="status" aria-live="polite" aria-label="Entering party">
      <div className="np-party-load-aura" aria-hidden="true" />
      <div className="np-party-load-grain" aria-hidden="true" />
      <div className="np-party-load-orbit" aria-hidden="true">
        <span /><span /><span />
      </div>
      <div className="np-party-load-body">
        <div className="np-party-load-stage">
          <div className="np-party-load-eq left" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ animationDelay: `${(i % 6) * 0.08}s` }} />)}
          </div>
          <div className="np-party-load-disc" aria-hidden="true">
            <div className="np-party-load-disc-ring" />
            <div className="np-party-load-disc-grooves" />
            <div className="np-party-load-disc-label">
              <span className="np-mark"><span /><span /><span /><span /></span>
            </div>
          </div>
          <div className="np-party-load-eq right" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ animationDelay: `${((i + 3) % 6) * 0.08}s` }} />)}
          </div>
        </div>
        <p className="np-party-load-kicker">{PARTY_LOAD_KICKER[mode]}</p>
        {partyName && <h2 className="np-party-load-title">{partyName}</h2>}
        {partyCode && <span className="np-party-load-code">{partyCode}</span>}
        <p className="np-party-load-line" key={`${mode}-${lineIndex}`}>{lines[lineIndex]}</p>
        <div className="np-party-load-track" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<"landing" | "create" | "join" | "lobby" | "live" | "reveal">("landing");
  const [createStep, setCreateStep] = useState(0);
  const [party, setParty] = useState<PartySnapshot | null>(null);
  const [joinPreview, setJoinPreview] = useState<PartySnapshot | null>(null);
  const [participantId, setParticipantId] = useState("");
  const [hostName, setHostName] = useState("");
  const [partyName, setPartyName] = useState("Rooftop Revels");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [maxSongs, setMaxSongs] = useState(12);
  const [customSongs, setCustomSongs] = useState(16);
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [previewError, setPreviewError] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [partyLoading, setPartyLoading] = useState<PartyLoadingMode | null>(() => {
    if (typeof window === "undefined") return null;
    const invite = readInviteCode();
    const session = readSession();
    if (session && !invite) return "restore";
    return null;
  });
  const [nowMs, setNowMs] = useState(Date.now());
  const [floats, setFloats] = useState<Array<{ id: number; left: number; size: number; dx: number; dur: number }>>([]);
  const [pendingCheers, setPendingCheers] = useState(0);
  const [cheerId, setCheerId] = useState(0);
  const floatIdRef = useRef(0);
  const [magnetDirection, setMagnetDirection] = useState<"up" | "down" | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0, active: false, hover: false });
  const [messages, setMessages] = useState<Array<{ id: string; name: string; text: string; at: number; system?: boolean }>>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [reactions, setReactions] = useState<Array<{ id: string; emoji: string; left: number }>>([]);
  const joinNameRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const magneticControlRef = useRef<HTMLElement | null>(null);
  const wheelLockRef = useRef(0);
  const partyCodeRef = useRef<string | null>(null);
  const screenRef = useRef(screen);
  const lastSnapshotAtRef = useRef(0);
  partyCodeRef.current = party?.code ?? null;
  screenRef.current = screen;

  const participant = useMemo(() => party?.participants.find((person) => person.id === participantId), [party, participantId]);
  const isHost = Boolean(participant?.isHost);
  const onAirId = party?.currentItem?.addedById ?? null;
  // Keep the person whose song is on air at the front of the room.
  const orderedParticipants = useMemo(() => {
    if (!party) return [];
    const onAir = onAirId ? party.participants.find((person) => person.id === onAirId) : undefined;
    return onAir ? [onAir, ...party.participants.filter((person) => person.id !== onAirId)] : party.participants;
  }, [party, onAirId]);
  const playbackProgress = useMemo(() => {
    if (!party?.currentItem || !party.currentStartedAt) return 0;
    const durationMs = Math.min(party.currentItem.track.durationMs ?? 30_000, 30_000);
    const elapsedMs = Math.max(0, nowMs - new Date(party.currentStartedAt).getTime());
    return Math.min(1, elapsedMs / durationMs);
  }, [nowMs, party?.currentItem, party?.currentStartedAt]);

  useEffect(() => {
    const inviteCode = readInviteCode();
    const session = readSession();

    // A saved session wins on refresh — but a share link always prompts for a name first.
    if (session) {
      if (inviteCode && inviteCode !== session.code) {
        setJoinCode(inviteCode);
        setJoinName("");
        setScreen("join");
        return;
      }

      if (inviteCode) {
        setJoinCode(inviteCode);
        setJoinName("");
        setScreen("join");
        return;
      }

      let cancelled = false;
      const started = Date.now();
      api.getParty(session.code)
        .then(async (snapshot) => {
          const me = snapshot.participants.find((person) => person.id === session.participantId);
          if (cancelled || !me || snapshot.status === "ENDED") {
            clearSession();
            if (inviteCode) {
              setJoinCode(inviteCode);
              setScreen("join");
            }
            return;
          }
          const remaining = ENTRY_MIN_MS - (Date.now() - started);
          if (remaining > 0) await delay(remaining);
          if (cancelled) return;
          clearInviteParam();
          setParty(snapshot);
          setParticipantId(session.participantId);
          setJoinCode(snapshot.code);
          setScreen(snapshot.status === "LIVE" ? "live" : "lobby");
        })
        .catch(() => {
          clearSession();
          if (inviteCode) {
            setJoinCode(inviteCode);
            setScreen("join");
          }
        })
        .finally(() => { if (!cancelled) setPartyLoading(null); });
      return () => { cancelled = true; };
    }

    if (inviteCode) {
      setJoinCode(inviteCode);
      setJoinName("");
      setScreen("join");
    }
  }, []);

  useEffect(() => {
    if (screen !== "join" || !joinPreview) return;
    joinNameRef.current?.focus();
  }, [screen, joinPreview?.code]);

  // Clear any stale error when navigating or editing inputs, so a failed join
  // doesn't leave "party not found" lingering on screens it no longer applies to.
  useEffect(() => { setMessage(""); }, [screen, joinCode, joinName]);

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

  // Chat is ephemeral per room — wipe it whenever the active party changes or ends.
  useEffect(() => {
    setMessages([]);
    setChatDraft("");
    setReactions([]);
  }, [party?.code]);

  useEffect(() => {
    const previewCode = screen === "join" ? joinCode.trim().toUpperCase() : "";
    const roomCode = party?.code ?? (previewCode.length === 6 ? previewCode : "");
    if (!roomCode) return;

    const inParty = Boolean(party?.code);
    // Re-join the room on every (re)connect — otherwise a dropped socket silently
    // stops receiving snapshots and that client goes stale while everyone else moves on.
    const joinRoom = () => socket.emit("party:join-room", { code: roomCode, participantId: participantId || undefined });
    const handleSnapshot = (snapshot: PartySnapshot) => {
      if (snapshot.code !== roomCode) return;
      lastSnapshotAtRef.current = Date.now();
      if (partyCodeRef.current === snapshot.code) {
        setParty(snapshot);
        if (snapshot.status === "LIVE") setScreen("live");
        if (snapshot.status === "ENDED") setScreen("reveal");
      }
      if (screenRef.current === "join") {
        setJoinPreview(snapshot);
      }
    };
    const handleChat = (msg: { id: string; name: string; text: string; at: number; system?: boolean }) =>
      setMessages((prev) => [...prev, msg].slice(-60));
    const handleReaction = (r: { id: string; emoji: string }) => {
      const item = { id: r.id, emoji: r.emoji, left: 8 + Math.random() * 84 };
      setReactions((prev) => [...prev, item]);
      window.setTimeout(() => setReactions((prev) => prev.filter((x) => x.id !== item.id)), 2200);
    };
    socket.on("connect", joinRoom);
    socket.on("party:snapshot", handleSnapshot);
    if (inParty) {
      socket.on("party:chat", handleChat);
      socket.on("party:reaction", handleReaction);
    }
    socket.connect();
    if (socket.connected) joinRoom();
    return () => {
      socket.off("connect", joinRoom);
      socket.off("party:snapshot", handleSnapshot);
      if (inParty) {
        socket.off("party:chat", handleChat);
        socket.off("party:reaction", handleReaction);
      }
    };
  }, [party?.code, participantId, screen, joinCode]);

  // Fallback sync if a socket event is missed — keeps lobby counts fresh without waiting on reconnect.
  useEffect(() => {
    const previewCode = screen === "join" ? joinCode.trim().toUpperCase() : "";
    const roomCode = party?.code ?? (previewCode.length === 6 ? previewCode : "");
    if (!roomCode || (screen !== "lobby" && screen !== "join")) return;

    const sync = () => {
      if (Date.now() - lastSnapshotAtRef.current < 800) return;
      api.getParty(roomCode)
        .then((snapshot) => {
          lastSnapshotAtRef.current = Date.now();
          if (partyCodeRef.current === snapshot.code) setParty(snapshot);
          if (screenRef.current === "join") setJoinPreview(snapshot);
        })
        .catch(() => undefined);
    };

    const interval = window.setInterval(sync, 1500);
    return () => window.clearInterval(interval);
  }, [screen, party?.code, joinCode]);

  useEffect(() => {
    const box = chatScrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages]);

  // Encore: play the winning track's preview on the reveal screen.
  useEffect(() => {
    if (screen !== "reveal" || !party?.winner?.previewUrl) return;
    const audio = new Audio(party.winner.previewUrl);
    audio.volume = 0.85;
    audio.play().catch(() => undefined);
    return () => { audio.pause(); audio.src = ""; };
  }, [screen, party?.winner?.previewUrl]);

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
    if (party?.status !== "LIVE" || !party.currentItem) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [party?.status, party?.currentItem?.id]);

  async function enterParty(mode: PartyLoadingMode, action: () => Promise<void>) {
    setPartyLoading(mode);
    setBusy(true);
    setMessage("");
    const started = Date.now();
    try {
      await action();
      const remaining = ENTRY_MIN_MS - (Date.now() - started);
      if (remaining > 0) await delay(remaining);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setPartyLoading(null);
      setBusy(false);
    }
  }

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

  function sendChat() {
    const text = chatDraft.trim();
    if (!text || !party?.code) return;
    socket.emit("party:chat", { code: party.code, name: participant?.name ?? "guest", text });
    setChatDraft("");
  }

  function sendReaction(emoji: string) {
    if (!party?.code) return;
    socket.emit("party:reaction", { code: party.code, name: participant?.name ?? "guest", emoji });
  }


  function startCreateFlow() {
    setCreateStep(0);
    setHostName("");
    setMessage("");
    setScreen("create");
  }

  async function createParty(songs: number = maxSongs) {
    if (!hostName.trim()) return;
    await enterParty("create", async () => {
      const next = await api.createParty({ name: partyName, hostName: hostName.trim(), maxSongs: songs });
      setParty(next);
      setParticipantId(next.participantId);
      saveSession(next.code, next.participantId);
      setJoinCode(next.code);
      clearInviteParam();
      setScreen("lobby");
    });
  }

  async function joinParty() {
    if (!joinCode.trim()) return;
    await enterParty("join", async () => {
      const next = await api.joinParty(joinCode.trim().toUpperCase(), joinName);
      setParty(next);
      setParticipantId(next.participantId);
      saveSession(next.code, next.participantId);
      clearInviteParam();
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

  async function goLive() {
    if (!party) return;
    await enterParty("live", async () => {
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

  async function copyInvite() {
    if (!party) return;
    const inviteUrl = `${window.location.origin}?party=${party.code}`;

    try {
      // Sync copy first — keeps the browser user-gesture so first click works reliably.
      if (copyTextToClipboard(inviteUrl)) {
        setInviteCopied(true);
        window.setTimeout(() => setInviteCopied(false), 1400);
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteCopied(true);
        window.setTimeout(() => setInviteCopied(false), 1400);
        return;
      }
      throw new Error("Copy unavailable.");
    } catch {
      setMessage("Copy failed. Select the room code and share it.");
    }
  }

  function applyInviteFromPaste(raw: string) {
    const code = parsePartyCodeFromInvite(raw);
    if (!code) return false;
    setJoinCode(code);
    setJoinName("");
    setScreen("join");
    const url = new URL(window.location.href);
    url.searchParams.set("party", code);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return true;
  }

  function handleInvitePaste(event: ClipboardEvent) {
    const pasted = event.clipboardData.getData("text");
    if (!parsePartyCodeFromInvite(pasted)) return;
    event.preventDefault();
    applyInviteFromPaste(pasted);
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

  // Optimistic cheer: show a pending +1 and the burst immediately. On success the
  // authoritative snapshot replaces it; on failure the pending +1 is dropped, so the
  // displayed count returns to the server value either way.
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
    createParty(Math.max(3, Math.min(50, customSongs)));
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
    }, { control: null, distance: 38 });

    if (!closest.control) {
      releaseMagneticControl();
      return false;
    }

    const rect = closest.control.getBoundingClientRect();
    const x = Math.max(-4, Math.min(4, ((event.clientX - (rect.left + rect.width / 2)) / rect.width) * 8));
    const y = Math.max(-3, Math.min(3, ((event.clientY - (rect.top + rect.height / 2)) / rect.height) * 6));

    if (magneticControlRef.current && magneticControlRef.current !== closest.control) {
      releaseMagneticControl();
    }

    closest.control.dataset.magnetic = "true";
    closest.control.style.setProperty("--np-magnet-x", `${x}px`);
    closest.control.style.setProperty("--np-magnet-y", `${y}px`);
    magneticControlRef.current = closest.control;
    return true;
  }

  function handleMagneticWheel(event: WheelEvent<HTMLElement>) {
    if (showAdd || Math.abs(event.deltaY) < 34) return;

    const now = Date.now();
    if (now - wheelLockRef.current < 620) return;

    const direction = event.deltaY > 0 ? "down" : "up";
    let moved = false;

    if (direction === "down") {
      if (screen === "landing") {
        startCreateFlow();
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
    <main
      className={magnetDirection ? `np magnet-${magnetDirection}` : "np"}
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
      onWheel={handleMagneticWheel}
    >
      <div
        className={[
          "np-cursor",
          cursor.active ? "show" : "",
          cursor.hover ? "hover" : "",
          magnetDirection ? "magnet" : "",
        ].join(" ")}
        style={{ left: cursor.x, top: cursor.y }}
      >
        <span />
      </div>
      {partyLoading && (
        <PartyEntryLoader
          mode={partyLoading}
          partyName={partyLoading === "create" ? partyName : joinPreview?.name ?? party?.name}
          partyCode={partyLoading === "restore" ? readSession()?.code : joinCode.trim() || party?.code}
        />
      )}
      {screen !== "live" && screen !== "reveal" && <Backdrop />}
      {screen !== "join" && <div className="np-progress">{["landing", "create", "lobby", "live", "reveal"].map((name, i) => <span key={name} className={i <= ["landing", "create", "lobby", "live", "reveal"].indexOf(screen) ? "on" : ""} />)}</div>}

      {screen === "landing" && (
        <section className="np-screen">
          <header className="np-top"><Logo /><div className="np-top-right"><span className="np-live">live</span></div></header>
          <div className="np-hero">
            <div className="np-hero-copy">
              <p className="np-kicker">submit · react · crown a winner</p>
              <h1><span className="np-rl">queue it.</span><span className="np-rl pink">cheer it.</span><span className="np-rl"><b>crown it.</b></span></h1>
              <p className="np-sub">Drop a song in the queue, react in real time, and the most-loved track gets crowned song of the night.</p>
              <div className="np-actions">
                <button className="np-btn pink" onClick={startCreateFlow}>start a party <ArrowRight size={19} /></button>
                <button className="np-btn ghost" onClick={() => { setJoinCode(""); setJoinPreview(null); setScreen("join"); }}>join with a code</button>
              </div>
            </div>
            <div className="np-mini-chat">
              <div className="np-mini-now"><AlbumTile size={52} round="50%" /><div><p>● a peek inside a live room</p><b>now playing, together</b><span>queue · cheer · crown</span></div></div>
              <div className="np-mini-feed"><div className="np-mini-track">
                {[...Array(2)].flatMap((_, copy) => ["this one goes hard", "turn it up", "no skips tonight", "vibes immaculate", "who added this?? 🔥", "encore!!"].map((text, i) => <div className="np-chat-line" key={`${copy}-${text}`}><Avatar name={people[(i % 6) + 1]} size={24} /><span><b>{people[(i % 6) + 1]}</b> {text}</span></div>))}
              </div></div>
            </div>
          </div>
        </section>
      )}

      {screen === "create" && (
        <section className="np-screen">
          <header className="np-top"><Logo /><div className="np-dots">{[0, 1, 2].map((i) => <span key={i} className={i === createStep ? "on" : ""} />)}<em>{createStep + 1} / 3</em></div></header>
          <div className="np-create">
            <p className="np-kicker">{["FIRST UP", "NAME THE NIGHT", "LAST ONE"][createStep]}</p>
            {createStep === 0 && <>
              <h2>what should<br />we call you?</h2>
              <input className="np-big-input" autoFocus value={hostName} onChange={(event) => setHostName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && hostName.trim() && setCreateStep(1)} placeholder="what should we call you?" aria-label="what should we call you?" />
              <div className="np-actions"><button className="np-btn pink" disabled={!hostName.trim()} onClick={() => setCreateStep(1)}>Continue <ArrowRight size={19} /></button><span className="np-help">press enter ↵</span></div>
            </>}
            {createStep === 1 && <>
              <h2>what should<br />we call it?</h2>
              <input className="np-big-input" autoFocus value={partyName} onChange={(event) => setPartyName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && partyName.trim() && setCreateStep(2)} />
              <div className="np-actions"><button className="np-btn pink" disabled={!partyName.trim()} onClick={() => setCreateStep(2)}>Continue <ArrowRight size={19} /></button><span className="np-help">press enter ↵</span></div>
            </>}
            {createStep === 2 && <>
              <h2>how many songs<br />can join?</h2>
              <div className="np-choice-row">{[7, 14, 21, 50].map((value) => <button key={value} className="np-choice" disabled={busy} onClick={() => createParty(value)}><b>{value === 50 ? "∞" : value}</b><span>{value === 50 ? "up to 50" : "songs"}</span></button>)}
                <div className="np-choice custom">
                  <input aria-label="Custom song limit" type="number" min={3} max={50} value={customSongs} onFocus={(event) => event.currentTarget.select()} onKeyDown={(event) => event.key === "Enter" && useCustomSongLimit()} onChange={(event) => setCustomSongs(Math.max(3, Math.min(50, Number(event.target.value) || 3)))} />
                  <span>custom songs</span>
                  <button disabled={busy} onClick={useCustomSongLimit}>set</button>
                </div>
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
              <div className="np-join-avatars">{joinPreview.participants.slice(0, 8).map((person) => <Avatar key={person.id} name={person.name} size={44} host={person.isHost} />)}<span><b>{joinPreview.participants.length}</b> tuning in</span></div>
              <div className="np-join-name">
                <p className="np-kicker">almost there</p>
                <h3>what should we call you?</h3>
              </div>
            </> : <>
              <p className="np-kicker">join a party</p>
              <h2>got a code?</h2>
              <input className="np-big-input" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} onPaste={handleInvitePaste} placeholder="party code" maxLength={6} autoFocus />
              <p className="np-help">ask the host for the 6-letter code</p>
            </>}
            <div className="np-join-form">
              <input ref={joinNameRef} value={joinName} onChange={(event) => setJoinName(event.target.value)} onPaste={handleInvitePaste} onKeyDown={(event) => event.key === "Enter" && joinName.trim() && joinParty()} placeholder="what should we call you?" autoFocus={Boolean(joinPreview)} aria-label="what should we call you?" />
              <button className="np-btn pink" onClick={joinParty} disabled={busy || joinCode.trim().length !== 6 || !joinName.trim()}>join the party <ArrowRight size={19} /></button>
            </div>
            {message && <p className="np-error">{message}</p>}
          </div>
        </section>
      )}

      {screen === "lobby" && party && (
        <section className="np-screen np-lobby">
          <header className="np-top"><Logo /><div className="np-top-right"><span className="np-soon">{party.participants.length} in the lobby</span><button className="np-copy" onClick={copyInvite}><Copy size={14} /> {inviteCopied ? "copied!" : "copy invite"}</button></div></header>
          <div className="np-lobby-title"><p>hosted by {party.hostName}</p><h2>{party.name.split(" ")[0]} <b>{party.name.split(" ").slice(1).join(" ")}</b></h2><span>{isHost ? "1. add a few songs to the queue   2. go live to start the party" : "add songs to the queue — the host starts the party when everyone's ready"}</span></div>
          <div className="np-lobby-people"><p><b>{party.participants.length}</b> tuning in</p><div>{party.participants.map((person) => <span key={person.id}><Avatar name={person.name} size={62} host={person.isHost} />{person.name}{person.isHost && <em>host</em>}</span>)}</div></div>
          <div className="np-lobby-queue">
            <span><em>queue building</em><b>{party.queue.length}/{party.maxSongs}</b></span>
            {party.queue.length > 0
              ? <div>{party.queue.slice(0, 4).map((item, i) => <button key={item.id} onClick={() => run(() => refresh(api.vote(party.code, participantId, item.id)))}><b>{i + 1}</b><AlbumTile track={item.track} size={38} round={8} /><span><strong className="np-track">{item.track.title}</strong><em>{item.addedByName}</em></span><small><ArrowUp size={13} />{item.votes}</small></button>)}</div>
              : <div className="np-lobby-empty"><span>no songs yet — add the first track to start the night</span></div>}
          </div>
          <div className="np-lobby-bottom">
            {party.queue.length > 0 && <div className="np-firstup"><AlbumTile track={party.queue[0].track} size={52} /><span><em>first up</em><b className="np-track">{party.queue[0].track.title}</b><small className="np-track">{party.queue[0].track.artist}</small></span></div>}
            <div className="np-lobby-actions"><button className="np-btn pink" onClick={() => setShowAdd(true)}><Plus size={18} /> add song</button>{isHost && <button className="np-btn gold" onClick={goLive} disabled={busy}>{party.queue.length === 0 ? "go live (auto-shuffle)" : "go live"} <ArrowRight size={18} /></button>}</div>
          </div>
        </section>
      )}

      {screen === "live" && party && (
        <section className="np-live-screen">
          <header className="np-live-top"><div><Logo /><span className="np-divider" /><b>{party.name}</b><span className="np-live">live</span></div><div>{orderedParticipants.slice(0, 5).map((p) => <Avatar key={p.id} name={p.name} size={30} host={p.isHost} />)}<span><Eye size={15} aria-hidden="true" />{party.participants.length}</span><button className="np-copy" onClick={copyInvite}><Copy size={14} aria-hidden="true" /> {inviteCopied ? "copied!" : "invite"}</button></div></header>
          <div className="np-now">
            <p className="np-kicker">now playing</p>
            <div className="np-now-main"><AlbumTile track={party.currentItem?.track} size={216} round={16} /><div><h2 className={party.currentItem ? "np-track" : undefined}>{party.currentItem?.track.title ?? "waiting for the first drop"}</h2><p className={party.currentItem ? "np-track" : undefined}>{party.currentItem?.track.artist ?? "add a song, then play the room"}</p><div className={party.currentItem ? "np-bars playing" : "np-bars"}>{Array.from({ length: 52 }).map((_, i) => <span key={i} className={i / 52 <= playbackProgress ? "played" : ""} style={{ animationDelay: `${(i % 8) * 0.08}s` }} />)}</div></div></div>
            <div className="np-cheer"><button key={cheerId} className="np-btn pink np-cheer-btn" disabled={!party.currentItem} onClick={cheer} aria-label="cheer the current song"><Heart size={24} aria-hidden="true" /></button><div className="np-cheer-tally"><b key={cheerId} className="np-cheer-count">{(party.currentItem?.cheers ?? 0) + pendingCheers}</b><span>cheers</span></div><div className="np-floats">{floats.map((float) => <Heart key={float.id} className="np-float" size={float.size} style={{ left: `${float.left}%`, "--dx": `${float.dx}px`, "--dur": `${float.dur}s` } as CSSProperties} />)}</div></div>
            <p className="np-scoring-hint"><Crown size={12} aria-hidden="true" /> cheer what's playing — unique fans move the crown</p>
            {isHost && <button className="np-skip-inline" onClick={() => run(() => refresh(api.advance(party.code)))}><SkipForward size={15} /> skip to next song</button>}
            <div className="np-room">
              <span className="np-room-label"><Lock size={11} /> standings sealed · in the room</span>
              <div className="np-room-avatars">{orderedParticipants.map((p) => {
                const onAir = Boolean(onAirId) && p.id === onAirId;
                return <div key={p.id} className={onAir ? "np-room-av on-air" : "np-room-av"}><Avatar name={p.name} size={42} host={p.isHost} />{onAir && <span className="np-onair">on air</span>}<em>{p.name}</em></div>;
              })}</div>
            </div>
            {previewError && <p className="np-preview-error">this preview won't play — skipping</p>}
          </div>
          <aside className="np-side">
            <div className="np-queue-head"><span>up next · {party.queue.length}</span><button onClick={() => setShowAdd(true)}><Plus size={14} /> add song</button></div>
            <p className="np-queue-hint"><ArrowUp size={11} aria-hidden="true" /> upvote to push a song up next</p>
            <div className="np-queue">{party.queue.map((item, i) => <div key={item.id} className="np-q-row"><b>{i + 1}</b><AlbumTile track={item.track} size={42} round={8} /><span><strong className="np-track">{item.track.title}</strong><em><span className="np-track">{item.track.artist}</span> · {item.addedByName}</em></span>{isHost && <button className="np-play-now" aria-label={`play ${item.track.title} now`} onClick={() => run(() => refresh(api.jump(party.code, item.id)))}><Play size={12} aria-hidden="true" />play</button>}<button className="np-vote" aria-label={`upvote ${item.track.title}`} onClick={() => run(() => refresh(api.vote(party.code, participantId, item.id)))}><ArrowUp size={14} aria-hidden="true" /><b>{item.votes}</b></button>{(item.addedById === participantId || isHost) && <button className="np-remove" aria-label={`remove ${item.track.title} from queue`} title="remove from queue" onClick={() => run(() => refresh(api.removeTrack(party.code, participantId, item.id)))}><X size={14} aria-hidden="true" /></button>}</div>)}</div>
            <div className="np-chat">
              <p>live chat</p>
              <div className="np-chat-feed" ref={chatScrollRef}>
                {messages.length === 0
                  ? <div className="np-chat-solo"><span>{party.participants.length <= 1 ? "just you so far — share the code to fill the room" : "say hi to the room — drop the first message"}</span>{party.participants.length <= 1 && <button className="np-copy" onClick={copyInvite}><Copy size={14} /> {inviteCopied ? "copied!" : "copy invite"}</button>}</div>
                  : messages.map((m) => m.system
                    ? <div key={m.id} className="np-chat-system"><span>{m.text}</span></div>
                    : <div key={m.id} className="np-chat-msg"><Avatar name={m.name} size={22} /><span><b>{m.name}</b> {m.text}</span></div>)}
              </div>
              <div className="np-chat-reacts">{["🔥", "❤️", "🙌", "😂", "🎉"].map((e) => <button key={e} type="button" onClick={() => sendReaction(e)}>{e}</button>)}</div>
              <form className="np-chat-compose" onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
                <input value={chatDraft} onChange={(e) => setChatDraft(e.target.value)} placeholder="say something…" maxLength={240} />
                <button type="submit" disabled={!chatDraft.trim()} aria-label="send"><ArrowRight size={15} /></button>
              </form>
            </div>
          </aside>
          <div className="np-reactions">{reactions.map((r) => <span key={r.id} style={{ left: `${r.left}%` }}>{r.emoji}</span>)}</div>
          {isHost && <button className="np-reveal-btn" onClick={reveal}>end the stream & reveal <ArrowRight size={16} /></button>}
          <audio ref={audioRef} className="np-audio" onError={handlePreviewError} />
        </section>
      )}

      {screen === "reveal" && party && (
        <section className="np-reveal">
          {Array.from({ length: 70 }).map((_, i) => <span key={i} className="np-confetti" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${i * 0.13}s` }} />)}
          <div className="np-crown"><Crown size={58} aria-hidden="true" /><p>the room has spoken</p><h2>song of the <b>night</b></h2></div>
          <div className="np-winner"><AlbumTile track={party.winner ?? undefined} size={230} round={14} /><div><h3 className={party.winner ? "np-track" : undefined}>{party.winner?.title ?? "no winner yet"}</h3><p className={party.winner ? "np-track" : undefined}>{party.winner?.artist}</p>{party.winner && <p className="np-winner-sub">{winnerSubtitle(party.winner)}</p>}{party.winner && <span className="np-winner-stat"><Heart size={16} aria-hidden="true" /> <b>{party.winner.cheers}</b> {party.winner.cheers === 1 ? "cheer" : "cheers"} · <b>{party.winner.uniqueCheerers}</b> {party.winner.uniqueCheerers === 1 ? "fan" : "fans"}</span>}</div></div>
          <div className="np-runners">{party.standings?.slice(1, 3).map((score, i) => <div key={score.queueItemId}><b>{i + 2}</b><AlbumTile track={score} size={44} round={9} /><span><strong className="np-track">{score.title}</strong><em className="np-track">{score.artist}</em></span><small><Heart size={14} />{score.cheers}</small></div>)}</div>
          <button className="np-btn pink np-runback" onClick={() => { clearSession(); setParty(null); setScreen("landing"); }}>run it back <ArrowRight size={17} /></button>
        </section>
      )}
      {party && showAdd && <AddSongModal query={query} setQuery={setQuery} tracks={tracks} search={search} close={() => setShowAdd(false)} add={addTrackToParty} state={searchState} />}
    </main>
  );
}

function AddSongModal({ query, setQuery, tracks, search, close, add, state }: { query: string; setQuery: (value: string) => void; tracks: Track[]; search: () => void; close: () => void; add: (track: Track) => void; state: "idle" | "loading" | "done" | "error" }) {
  const searchRef = useRef(search);
  searchRef.current = search;
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = window.setTimeout(() => searchRef.current(), 320);
    return () => window.clearTimeout(timer);
  }, [query]);

  const suggestion = useMemo(() => {
    const typed = query.trim();
    if (typed.length < 2) return null;
    const match = tracks.find((track) => track.title.toLowerCase().startsWith(typed.toLowerCase()));
    if (!match) return null;
    return { ghost: `${match.title.slice(typed.length)} — ${match.artist}`, full: match.title };
  }, [tracks, query]);

  function accept() {
    if (suggestion) setQuery(suggestion.full);
  }
  return (
    <div className="np-modal" onClick={close}>
      <div onClick={(event) => event.stopPropagation()}>
        <header><h2>add a song</h2><button onClick={close}><X /></button></header>
        <label>
          <Search size={17} />
          <span className="np-typeahead">
            {suggestion && <span className="np-ghost np-track" aria-hidden="true"><span>{query}</span>{suggestion.ghost}</span>}
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") return search();
                if (suggestion && (event.key === "Tab" || (event.key === "ArrowRight" && event.currentTarget.selectionStart === query.length))) {
                  event.preventDefault();
                  accept();
                }
              }}
              placeholder="start typing a track or artist…"
            />
          </span>
          <button onClick={search}>search</button>
        </label>
        <section>
          {state === "loading" ? <p className="np-modal-note">searching…</p>
            : state === "error" ? <p className="np-modal-note">couldn't reach search right now. try again.</p>
            : state === "done" && tracks.length === 0 ? <p className="np-modal-note">nothing for "{query}". try another title or artist.</p>
            : tracks.map((track) => <button key={track.providerId} onClick={() => add(track)}><AlbumTile track={track} size={44} round={8} /><span><b className="np-track">{track.title}</b><em className="np-track">{track.artist}</em></span><small><Plus size={15} /> add</small></button>)}
        </section>
      </div>
    </div>
  );
}
