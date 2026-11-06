import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { auth } from "../../firebase/firebase";
import { apiRequest } from "@/lib/api";

const SOUND_KEY = "ob-chat-sound";
const API_URL = import.meta.env.VITE_API_URL || undefined;
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

// Slash command suggestions are intentionally empty until project commands are backed by APIs.
export const COMMANDS = [];

function upsertMessage(current, message) {
  const index = current.findIndex((item) => item.id === message.id);
  if (index === -1) return [...current, message];
  const next = [...current];
  next[index] = { ...next[index], ...message };
  return next;
}

export function useChat(projectSlug) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(Boolean(projectSlug));
  const [typing, setTyping] = useState(null);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [sound, setSound] = useState(() => safe(() => localStorage.getItem(SOUND_KEY) !== "off", true));
  const socketRef = useRef(null);
  const deletedIds = useRef(new Set());
  const typingSent = useRef(false);

  const refresh = useCallback(async () => {
    if (!projectSlug) return;
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages`);
      setMessages((current) => {
        const merged = result.messages.filter((message) => !deletedIds.current.has(message.id));
        return current.reduce(upsertMessage, merged);
      });
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [projectSlug]);

  useEffect(() => {
    setMessages([]);
    setLoading(Boolean(projectSlug));
    setTyping(null);
    deletedIds.current.clear();
    typingSent.current = false;
    if (!projectSlug) return undefined;

    let disposed = false;
    let socket;
    setConnectionStatus("connecting");
    refresh();

    async function connect() {
      try {
        if (!auth.currentUser) throw new Error("Sign in again to join project chat.");
        if (disposed) return;

        socket = io(API_URL, {
          auth: (callback) => {
            auth.currentUser?.getIdToken()
              .then((token) => callback({ token }))
              .catch(() => callback({ token: "" }));
          },
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          setConnectionStatus("connecting");
          socket.emit("project:join", { slug: projectSlug }, (result) => {
            if (!result?.ok) {
              setConnectionStatus("offline");
              setError(result?.error || "Could not join project chat.");
              return;
            }
            setConnectionStatus("connected");
            setError("");
            refresh();
          });
        });
        socket.on("disconnect", () => {
          setConnectionStatus("reconnecting");
          setTyping(null);
        });
        socket.on("connect_error", (connectError) => {
          setConnectionStatus("offline");
          setError(connectError.message || "Live chat is unavailable.");
        });
        socket.on("chat:message-created", (message) => {
          const normalized = { ...message, me: message.authorUid === auth.currentUser?.uid };
          setMessages((current) => upsertMessage(current, normalized));
        });
        socket.on("chat:message-updated", (message) => {
          setMessages((current) => current.map((item) => item.id === message.id
            ? { ...item, body: message.body, edited: message.edited }
            : item));
        });
        socket.on("chat:message-deleted", ({ id }) => {
          deletedIds.current.add(id);
          setMessages((current) => current.filter((message) => message.id !== id));
        });
        socket.on("chat:reaction-updated", (update) => {
          const myReaction = update.userId === auth.currentUser?.uid;
          setMessages((current) => current.map((message) => {
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
      socketRef.current = null;
      socket?.disconnect();
    };
  }, [projectSlug, refresh]);

  useEffect(() => {
    safe(() => localStorage.setItem(SOUND_KEY, sound ? "on" : "off"));
  }, [sound]);

  const send = useCallback(async (body, attachments = [], replyTo = null) => {
    if (!projectSlug) return;
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages`, {
        method: "POST",
        body: { body, attachments, replyTo },
      });
      setMessages((current) => upsertMessage(current, result.message));
      setError("");
      socketRef.current?.emit("chat:typing", { isTyping: false });
      typingSent.current = false;
      return true;
    } catch (sendError) {
      setError(sendError.message);
      return false;
    }
  }, [projectSlug]);

  const edit = useCallback(async (id, body) => {
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages/${encodeURIComponent(id)}`, { method: "PUT", body: { body } });
      setMessages((current) => current.map((message) => message.id === id ? result.message : message));
      setError("");
      return true;
    } catch (editError) {
      setError(editError.message);
      return false;
    }
  }, [projectSlug]);

  const remove = useCallback(async (id) => {
    try {
      await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
      deletedIds.current.add(id);
      setMessages((current) => current.filter((message) => message.id !== id));
      setError("");
    } catch (removeError) {
      setError(removeError.message);
    }
  }, [projectSlug]);

  const react = useCallback(async (id, emoji) => {
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages/${encodeURIComponent(id)}/reactions`, {
        method: "PATCH",
        body: { emoji },
      });
      setMessages((current) => current.map((message) => message.id === id ? result.message : message));
      setError("");
    } catch (reactionError) {
      setError(reactionError.message);
    }
  }, [projectSlug]);

  const typingActivity = useCallback((isTyping) => {
    if (typingSent.current === isTyping) return;
    typingSent.current = isTyping;
    socketRef.current?.emit("chat:typing", { isTyping });
  }, []);

  return { messages, typing, loading, error, connectionStatus, sound, setSound, send, edit, remove, react, refresh, typingActivity };
}
