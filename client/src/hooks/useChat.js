import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { auth } from "../../firebase/firebase";
import { apiRequest } from "@/lib/api";

const SOUND_KEY = "ob-chat-sound";
const API_URL = import.meta.env.VITE_API_URL || undefined;
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

// Slash commands handled by the central AI agent (see server/services/ai/triggers.js).
export const COMMANDS = [
  { cmd: "/explain", hint: "Ask the agent to explain code, an issue or the project" },
  { cmd: "/criteria", hint: "Ask the agent to draft acceptance criteria" },
  { cmd: "/review", hint: "Review a pull request: /review 12" },
  { cmd: "/setcriteria", hint: "Maintainers: approve criteria, one per line" },
];

function upsertMessage(current, message) {
  const index = current.findIndex((item) => item.id === message.id || (
    message.clientMessageId && item.clientMessageId === message.clientMessageId
    && item.authorUid === message.authorUid && (item.status === "sending" || message.status === "sending")
  ));
  if (index === -1) return [...current, message];
  // A socket echo, POST response or history fetch may confirm the same send first.
  if (current[index].status !== "sending") return current;
  const next = [...current];
  next[index] = { ...next[index], ...message };
  return next;
}

export function useChat(projectSlug) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(Boolean(projectSlug));
  const [typing, setTyping] = useState(null);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [sound, setSound] = useState(() => safe(() => localStorage.getItem(SOUND_KEY) !== "off", true));
  const socketRef = useRef(null);
  const historyRequest = useRef(null);
  const deletedIds = useRef(new Set());
  const typingSent = useRef(false);

  const updateMessages = useCallback((update) => {
    historyRequest.current?.updates.push(update);
    setMessages(update);
  }, []);

  const refresh = useCallback(async () => {
    if (!projectSlug || historyRequest.current) return;
    const request = { controller: new AbortController(), updates: [] };
    historyRequest.current = request;
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages`, {
        signal: request.controller.signal,
      });
      if (historyRequest.current !== request) return;
      setMessages((current) => {
        const pending = current.filter((message) => message.status === "sending");
        const snapshot = result.messages.filter((message) => !deletedIds.current.has(message.id));
        return request.updates.reduce((messages, update) => update(messages), pending.reduce(upsertMessage, snapshot));
      });
      setHistoryError("");
    } catch (loadError) {
      if (historyRequest.current === request) setHistoryError(loadError.message);
    } finally {
      if (historyRequest.current === request) {
        historyRequest.current = null;
        setLoading(false);
      }
    }
  }, [projectSlug]);

  useEffect(() => {
    setMessages([]);
    setLoading(Boolean(projectSlug));
    setTyping(null);
    typingSent.current = false;
    if (!projectSlug) return undefined;

    let disposed = false;
    let socket;
    let joined = false;
    let joining = false;
    setConnectionStatus("connecting");

    function join() {
      if (!socket?.connected || joined || joining) return;
      joining = true;
      socket.timeout(5000).emit("project:join", { slug: projectSlug }, (err, result) => {
        joining = false;
        if (disposed || !socket.connected) return;
        joined = !err && result?.ok === true;
        setConnectionStatus(joined ? "connected" : "offline");
        // If an initial history request raced with room entry, fetch again once it finishes.
        if (joined) {
          historyRequest.current?.controller.abort();
          historyRequest.current = null;
          refresh();
        }
      });
    }

    const catchUp = () => {
      if (document.visibilityState === "hidden") return;
      if (socket && !socket.active) socket.connect();
      join();
      refresh();
    };
    const fallback = window.setInterval(() => { if (!joined) catchUp(); }, 5000);
    window.addEventListener("focus", catchUp);
    refresh();

    async function connect() {
      try {
        if (!auth.currentUser) throw new Error("Sign in again to join project chat.");
        if (disposed) return;

        socket = io(API_URL, {
          auth: (callback) => {
            if (!auth.currentUser) return callback({ token: "" });
            auth.currentUser.getIdToken()
              .then((token) => callback({ token }))
              .catch(() => callback({ token: "" }));
          },
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          setConnectionStatus("connecting");
          join();
        });
        socket.on("disconnect", () => {
          joined = false;
          joining = false;
          setConnectionStatus("reconnecting");
          setTyping(null);
        });
        socket.on("connect_error", () => {
          setConnectionStatus("offline");
        });
        socket.on("chat:message-created", (message) => {
          if (deletedIds.current.has(message.id)) return;
          const me = message.authorUid === auth.currentUser?.uid;
          updateMessages((current) => upsertMessage(current, { ...message, me, status: me ? "sent" : undefined }));
        });
        socket.on("chat:message-updated", (message) => {
          updateMessages((current) => current.map((item) => item.id === message.id
            ? { ...item, body: message.body, edited: message.edited }
            : item));
        });
        socket.on("chat:message-deleted", ({ id }) => {
          deletedIds.current.add(id);
          updateMessages((current) => current.filter((message) => message.id !== id));
        });
        socket.on("chat:reaction-updated", (update) => {
          const myReaction = update.userId === auth.currentUser?.uid;
          updateMessages((current) => current.map((message) => {
            if (message.id !== update.id) return message;
            const reactions = { ...(message.reactions || {}) };
            if (update.count <= 0) delete reactions[update.emoji];
            else reactions[update.emoji] = {
              count: update.count,
              mine: myReaction ? update.active : Boolean(reactions[update.emoji]?.mine),
            };
            return { ...message, reactions };
          }));
        });
        socket.on("agent:status", ({ working }) => {
          setTyping(working ? "Bounty agent" : null);
          if (working) window.setTimeout(() => setTyping((current) => current === "Bounty agent" ? null : current), 90000);
        });
        socket.on("chat:typing", ({ uid, name, isTyping }) => {
          if (uid === auth.currentUser?.uid) return;
          setTyping(isTyping ? name : null);
          if (isTyping) window.setTimeout(() => setTyping((current) => current === name ? null : current), 2500);
        });
      } catch (connectError) {
        if (!disposed) {
          setConnectionStatus("offline");
          setError(connectError.message);
        }
      }
    }

    connect();
    return () => {
      disposed = true;
      window.clearInterval(fallback);
      window.removeEventListener("focus", catchUp);
      historyRequest.current?.controller.abort();
      historyRequest.current = null;
      socketRef.current = null;
      socket?.disconnect();
    };
  }, [projectSlug, refresh, updateMessages]);

  useEffect(() => {
    safe(() => localStorage.setItem(SOUND_KEY, sound ? "on" : "off"));
  }, [sound]);

  const send = useCallback(async (body, attachments = [], replyTo = null) => {
    if (!projectSlug || !auth.currentUser) return false;
    const user = auth.currentUser;
    const clientMessageId = Array.from(crypto.getRandomValues(new Uint8Array(16)),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
    const name = user.displayName || "GitHub user";
    const pending = {
      id: clientMessageId, clientMessageId, authorUid: user.uid, type: "message",
      author: { name, initials: name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase(), color: "orange" },
      me: true, status: "sending", variant: "outlined",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
      body, attachments, replyTo, reactions: {},
    };
    updateMessages((current) => upsertMessage(current, pending));
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages`, {
        method: "POST",
        body: { body, attachments, replyTo, clientMessageId },
      });
      updateMessages((current) => deletedIds.current.has(result.message.id)
        ? current.filter((message) => message.id !== pending.id)
        : upsertMessage(current, result.message));
      setError("");
      socketRef.current?.emit("chat:typing", { isTyping: false });
      typingSent.current = false;
      return true;
    } catch (sendError) {
      updateMessages((current) => current.filter((message) => message.id !== pending.id));
      setError(sendError.message);
      return false;
    }
  }, [projectSlug, updateMessages]);

  const edit = useCallback(async (id, body) => {
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages/${encodeURIComponent(id)}`, { method: "PUT", body: { body } });
      updateMessages((current) => current.map((message) => message.id === id ? result.message : message));
      setError("");
      return true;
    } catch (editError) {
      setError(editError.message);
      return false;
    }
  }, [projectSlug, updateMessages]);

  const remove = useCallback(async (id) => {
    try {
      await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
      deletedIds.current.add(id);
      updateMessages((current) => current.filter((message) => message.id !== id));
      setError("");
    } catch (removeError) {
      setError(removeError.message);
    }
  }, [projectSlug, updateMessages]);

  const react = useCallback(async (id, emoji) => {
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages/${encodeURIComponent(id)}/reactions`, {
        method: "PATCH",
        body: { emoji },
      });
      updateMessages((current) => current.map((message) => message.id === id ? result.message : message));
      setError("");
    } catch (reactionError) {
      setError(reactionError.message);
    }
  }, [projectSlug, updateMessages]);

  const typingActivity = useCallback((isTyping) => {
    if (typingSent.current === isTyping) return;
    typingSent.current = isTyping;
    socketRef.current?.emit("chat:typing", { isTyping });
  }, []);

  return { messages, typing, loading, error: error || historyError, connectionStatus, sound, setSound, send, edit, remove, react, refresh, typingActivity };
}
