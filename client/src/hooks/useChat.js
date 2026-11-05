import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

const SOUND_KEY = "ob-chat-sound";
const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

// Slash command suggestions are intentionally empty until project commands are backed by APIs.
export const COMMANDS = [];

export function useChat(projectSlug) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(Boolean(projectSlug));
  const [typing] = useState(null);
  const [error, setError] = useState("");
  const [sound, setSound] = useState(() => safe(() => localStorage.getItem(SOUND_KEY) !== "off", true));

  const refresh = useCallback(async () => {
    if (!projectSlug) return;
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages`);
      setMessages(result.messages);
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
    refresh();
    const interval = window.setInterval(refresh, 8000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    safe(() => localStorage.setItem(SOUND_KEY, sound ? "on" : "off"));
  }, [sound]);

  const send = useCallback(async (body, attachments = [], replyTo = null) => {
    if (!projectSlug) return;
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages`, { method: "POST", body: { body, attachments, replyTo } });
      setMessages((current) => [...current.filter((message) => message.id !== result.message.id), result.message]);
      setError("");
    } catch (sendError) {
      setError(sendError.message);
    }
  }, [projectSlug]);

  const edit = useCallback(async (id, body) => {
    try {
      const result = await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages/${encodeURIComponent(id)}`, { method: "PUT", body: { body } });
      setMessages((current) => current.map((message) => message.id === id ? result.message : message));
      setError("");
    } catch (editError) {
      setError(editError.message);
    }
  }, [projectSlug]);

  const remove = useCallback(async (id) => {
    try {
      await apiRequest(`/projects/${encodeURIComponent(projectSlug)}/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
      setMessages((current) => current.filter((message) => message.id !== id));
      setError("");
    } catch (removeError) {
      setError(removeError.message);
    }
  }, [projectSlug]);

  const react = useCallback((id, emoji) => {
    setMessages((current) => current.map((message) => {
      if (message.id !== id) return message;
      const reactions = { ...(message.reactions || {}) };
      const reaction = reactions[emoji] || { count: 0, mine: false };
      const updated = reaction.mine ? { count: reaction.count - 1, mine: false } : { count: reaction.count + 1, mine: true };
      if (updated.count <= 0) delete reactions[emoji];
      else reactions[emoji] = updated;
      return { ...message, reactions };
    }));
  }, []);

  return { messages, typing, loading, error, sound, setSound, send, edit, remove, react, refresh };
}
