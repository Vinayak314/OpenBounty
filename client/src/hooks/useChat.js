import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MESSAGES } from "@/data/project";
import { useAuth } from "@/auth/AuthContext";

const KEY = "ob-chat-v1:general";
const SOUND_KEY = "ob-chat-sound";

const ME = { name: "GitHub user", initials: "GH", color: "orange" };
const AGENT = { name: "Bounty agent", agent: true };
const TEAMMATES = [
  { name: "Priya Kumar", initials: "PK", color: "navy" },
  { name: "Rohan Mehta", initials: "RM", color: "navy" },
  { name: "Maya Iyer", initials: "MI", color: "pink" },
];
const TEAM_LINES = [
  "Nice, thanks for the update. I'll take a look after standup.",
  "Sounds good to me. Ping me when the docs are in.",
  "Agreed. Let's keep the criteria as they are for #42.",
  "👍 Reviewing the PR now.",
  "Can you add a note about this to the PR description?",
];

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowLabel = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

function beep() {
  safe(() => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
  });
}

const agentReply = (text) => {
  const t = text.toLowerCase();
  if (/(pay|payout|usdc)/.test(t))
    return "Payouts need a maintainer approval and wallet confirmation. #38 is approved and ready: Priya can release the 120 USDC.";
  if (/(evidence|review|criteria|report)/.test(t))
    return "Re-checked PR #87: arrow-key navigation is supported, the shortcut docs are still missing, and the screen-reader announcement needs a manual NVDA check.";
  if (/(status|progress|update)/.test(t))
    return "Status for #42: 1 of 3 criteria supported, 1 missing, 1 needs verification. I'll update the report when new commits land.";
  return "Got it. I'll look at the latest activity on PR #87 and post an updated evidence report here. A maintainer makes the final call.";
};

export const COMMANDS = [
  { cmd: "/status", hint: "Ask the agent for bounty #42 status" },
  { cmd: "/review", hint: "Ask the agent to re-review the evidence" },
  { cmd: "/help", hint: "Show available commands" },
  { cmd: "/clear", hint: "Reset this conversation" },
];

function load() {
  const stored = safe(() => JSON.parse(localStorage.getItem(KEY)), null);
  if (!Array.isArray(stored) || !stored.length) return MESSAGES;
  return stored.map((m) => (m.status === "sending" ? { ...m, status: "seen" } : m));
}

export function useChat() {
  const { name, initials } = useAuth();
  const currentUser = useMemo(() => ({ ...ME, name, initials }), [name, initials]);
  const [messages, setMessages] = useState(() => load().map((message) => (
    message.author?.name === "Ananya Shah"
      ? { ...message, me: true, author: { ...message.author, name, initials } }
      : message
  )));
  const [typing, setTyping] = useState(null);
  const [sound, setSound] = useState(() => safe(() => localStorage.getItem(SOUND_KEY) !== "off", true));
  const timers = useRef([]);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    safe(() => localStorage.setItem(KEY, JSON.stringify(messages)));
  }, [messages]);
  useEffect(() => {
    safe(() => localStorage.setItem(SOUND_KEY, sound ? "on" : "off"));
  }, [sound]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  const patch = (id, p) => setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const incoming = useCallback((msg) => {
    setMessages((m) => [...m, { id: uid("i"), type: "message", time: nowLabel(), variant: "filled", ...msg }]);
    if (soundRef.current) beep();
  }, []);

  const converse = useCallback(
    (author, body, delay = 2200) => {
      later(() => setTyping(author.name), 600);
      later(() => {
        setTyping(null);
        incoming({ author, body });
      }, delay);
    },
    [incoming],
  );

  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMessages(MESSAGES);
    setTyping(null);
  }, []);

  const send = useCallback(
    (text, attachments = [], replyTo = null) => {
      const cmd = text.trim().split(/\s+/)[0].toLowerCase();
      if (cmd === "/clear") return reset();
      if (cmd === "/help") {
        return setMessages((m) => [
          ...m,
          { id: uid("s"), type: "message", author: AGENT, time: nowLabel(), variant: "filled", body: `Commands:\n${COMMANDS.map((c) => `${c.cmd} – ${c.hint}`).join("\n")}\nMention @Bounty agent in any message to ask it something.` },
        ]);
      }
      const agentText = cmd === "/status" ? "@Bounty agent status update" : cmd === "/review" ? "@Bounty agent review the evidence" : text;
      const id = uid("u");
      setMessages((m) => [
        ...m,
        { id, type: "message", author: currentUser, me: true, time: nowLabel(), variant: "outlined", body: text, attachments, replyTo, status: "sending" },
      ]);
      later(() => patch(id, { status: "sent" }), 500);
      const toAgent = /@bounty/i.test(agentText);
      later(() => patch(id, { status: "seen" }), toAgent ? 1200 : 1600);
      if (toAgent) {
        converse(AGENT, agentReply(agentText), 2600);
      } else if (!cmd.startsWith("/") && Math.random() < 0.6) {
        const who = TEAMMATES[Math.floor(Math.random() * TEAMMATES.length)];
        converse(who, TEAM_LINES[Math.floor(Math.random() * TEAM_LINES.length)], 3200);
      }
    },
    [converse, reset, currentUser],
  );

  const edit = useCallback((id, body) => patch(id, { body, edited: true }), []);
  const remove = useCallback((id) => setMessages((m) => m.filter((x) => x.id !== id)), []);

  const react = useCallback((id, emoji) => {
    setMessages((ms) =>
      ms.map((m) => {
        if (m.id !== id) return m;
        const r = { ...(m.reactions || {}) };
        const cur = r[emoji] || { count: 0, mine: false };
        const next = cur.mine ? { count: cur.count - 1, mine: false } : { count: cur.count + 1, mine: true };
        if (next.count <= 0) delete r[emoji];
        else r[emoji] = next;
        return { ...m, reactions: r };
      }),
    );
  }, []);

  return { messages, typing, sound, setSound, send, edit, remove, react, reset };
}
