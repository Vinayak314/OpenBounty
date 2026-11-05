import { useEffect, useRef, useState } from "react";
import { ArrowUp, CornerUpLeft, FileText, Paperclip, Pencil, Smile, X } from "lucide-react";
import { CHANNEL } from "@/data/project";
import { COMMANDS } from "@/hooks/useChat";

const EMOJIS = ["😀", "😂", "🙂", "😍", "🤔", "😅", "🙌", "👏", "👍", "👎", "🎉", "🔥", "✅", "❌", "👀", "🚀", "💡", "🐛", "❤️", "🙏", "💸", "📎", "⚠️", "✨"];
const MAX_IMG = 400 * 1024;

const MENTIONABLE = [];

const readDraft = (key) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const toDataUrl = (file) =>
  new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => res(null);
    r.readAsDataURL(file);
  });

export default function Composer({ onSend, replyTo, onCancelReply, editing, onSaveEdit, onCancelEdit, projectSlug, projectName }) {
  const draftKey = `ob-chat-draft:${projectSlug || "project"}`;
  const [text, setText] = useState(() => readDraft(draftKey));
  const [files, setFiles] = useState([]);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const area = useRef(null);
  const fileInput = useRef(null);
  const emojiRef = useRef(null);
  const savedDraft = useRef(null);

  const canSend = text.trim().length > 0 || (!editing && files.length > 0);

  // Drafts: persist per channel (not while editing an existing message).
  useEffect(() => {
    if (editing) return;
    try {
      localStorage.setItem(draftKey, text);
    } catch {
      /* storage unavailable */
    }
  }, [text, editing, draftKey]);

  // Entering/leaving edit mode swaps the box content.
  useEffect(() => {
    if (editing) {
      savedDraft.current = text;
      setText(editing.body);
      setFiles([]);
      requestAnimationFrame(() => area.current?.focus());
    } else if (savedDraft.current !== null) {
      setText(savedDraft.current);
      savedDraft.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!emoji) return;
    const close = (e) => !emojiRef.current?.contains(e.target) && setEmoji(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [emoji]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  // Suggestions: "/cmd" at the very start, or "@name" before the caret.
  const before = text.slice(0, caret);
  const slash = before.match(/^\/(\w*)$/);
  const at = before.match(/@([\w ]*)$/);
  let suggestions = [];
  if (!dismissed && !editing) {
    if (slash) {
      suggestions = COMMANDS.filter((c) => c.cmd.startsWith(`/${slash[1].toLowerCase()}`)).map((c) => ({
        key: c.cmd,
        label: c.cmd,
        hint: c.hint,
        apply: () => c.cmd + " ",
        range: [0, caret],
      }));
    } else if (at) {
      suggestions = MENTIONABLE.filter((m) => m.name.toLowerCase().includes(at[1].toLowerCase()))
        .slice(0, 4)
        .map((m) => ({ key: m.id, label: `@${m.name}`, apply: () => `@${m.name} `, range: [caret - at[0].length, caret] }));
    }
  }

  const setTextAt = (next, pos) => {
    setText(next);
    setCaret(pos);
    setDismissed(false);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
    });
  };

  const pick = (s) => {
    const ins = s.apply();
    const next = text.slice(0, s.range[0]) + ins + text.slice(s.range[1]);
    setTextAt(next, s.range[0] + ins.length);
    setActive(0);
  };

  const insertAtCaret = (snippet) => {
    const pos = area.current?.selectionStart ?? text.length;
    setTextAt(text.slice(0, pos) + snippet + text.slice(pos), pos + snippet.length);
  };

  const addFiles = async (list) => {
    const remaining = Math.max(0, 5 - files.length);
    const items = await Promise.all(
      Array.from(list).slice(0, remaining).map(async (f) => ({
        name: f.name,
        preview: f.type.startsWith("image/") && f.size <= MAX_IMG ? await toDataUrl(f) : null,
      })),
    );
    setFiles((cur) => [...cur, ...items]);
  };

  const submit = () => {
    if (!canSend) return;
    if (editing) return onSaveEdit(text.trim());
    onSend(text.trim(), files);
    setText("");
    setFiles([]);
    setCaret(0);
  };

  const onKeyDown = (e) => {
    if (suggestions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        return setActive((a) => (a + d + suggestions.length) % suggestions.length);
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        return pick(suggestions[Math.min(active, suggestions.length - 1)]);
      }
    }
    if (e.key === "Escape") {
      if (suggestions.length) setDismissed(true);
      else if (editing) onCancelEdit();
      else if (replyTo) onCancelReply();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const bar = "mb-2 flex animate-[pop_.15s_ease-out] items-center gap-2 rounded-[10px] bg-ob-mist px-3 py-[6px] text-[10px]";

  return (
    <div className="shrink-0 border-t border-ob-line bg-[#f8fafc] px-6 pb-3 pt-3">
      <div className="relative">
        {suggestions.length > 0 && (
          <ul className="absolute bottom-full left-0 z-10 mb-2 w-[260px] animate-[pop_.15s_ease-out] overflow-hidden rounded-[12px] border border-ob-line bg-white p-1 shadow-lg">
            {suggestions.map((s, i) => (
              <li key={s.key}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-baseline gap-2 rounded-[8px] px-3 py-[7px] text-left text-[11px] ${i === active ? "bg-ob-mist" : ""}`}
                >
                  <span className="font-semibold">{s.label}</span>
                  {s.hint && <span className="truncate text-[10px] text-ob-slate">{s.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div
          className={`rounded-[14px] border bg-white px-[14px] pb-[10px] pt-[12px] transition-shadow duration-200 ${
            focused ? "border-ob-navy/40 shadow-[0_0_0_3px_rgba(7,27,62,0.06)]" : "border-ob-line"
          }`}
        >
          {replyTo && !editing && (
            <div className={bar}>
              <CornerUpLeft className="size-3 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Replying to <b>{replyTo.author}</b>: {replyTo.snippet}
              </span>
              <button type="button" aria-label="Cancel reply" onClick={onCancelReply}><X className="size-3" /></button>
            </div>
          )}
          {editing && (
            <div className={bar}>
              <Pencil className="size-3 shrink-0" />
              <span className="flex-1">Editing message · Enter to save, Esc to cancel</span>
              <button type="button" aria-label="Cancel edit" onClick={onCancelEdit}><X className="size-3" /></button>
            </div>
          )}
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="relative flex animate-[pop_.15s_ease-out] items-center gap-[6px] rounded-[10px] bg-ob-mist p-1 pr-[10px] text-[10px] font-medium">
                  {f.preview ? (
                    <img src={f.preview} alt={f.name} className="size-10 rounded-[8px] object-cover" />
                  ) : (
                    <FileText className="ml-1 size-3" />
                  )}
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button type="button" aria-label="Remove attachment" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X className="size-3 text-ob-slate" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={area}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart);
              setDismissed(false);
              setActive(0);
            }}
            onSelect={(e) => setCaret(e.target.selectionStart)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPaste={(e) => {
              const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (imgs.length && !editing) {
                e.preventDefault();
                addFiles(imgs);
              }
            }}
            placeholder={`Message #general in ${projectName || CHANNEL.project}…`}
            className="block max-h-40 w-full resize-none bg-transparent text-[12px] leading-5 text-ob-navy outline-none placeholder:text-ob-slate"
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="relative flex items-center gap-3 text-ob-slate">
              {!editing && (
                <button type="button" aria-label="Attach file" onClick={() => fileInput.current?.click()} className="transition-colors hover:text-ob-navy">
                  <Paperclip className="size-4" strokeWidth={1.6} />
                </button>
              )}
              <div ref={emojiRef} className="relative">
                <button type="button" aria-label="Add emoji" onClick={() => setEmoji((v) => !v)} className="transition-colors hover:text-ob-navy">
                  <Smile className="size-4" strokeWidth={1.6} />
                </button>
                {emoji && (
                  <div className="absolute bottom-full left-0 z-10 mb-2 grid w-[208px] animate-[pop_.15s_ease-out] grid-cols-6 gap-1 rounded-[12px] border border-ob-line bg-white p-2 shadow-lg">
                    {EMOJIS.map((e) => (
                      <button key={e} type="button" onClick={() => insertAtCaret(e)} className="rounded-[6px] p-1 text-[16px] transition-transform hover:scale-125 hover:bg-ob-mist">
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <span className="text-[10px]">Markdown · Enter to send</span>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="flex h-8 w-[74px] items-center justify-center gap-[6px] rounded-[8px] bg-ob-navy text-[11px] font-semibold text-white transition-all duration-150 enabled:hover:bg-[#0f2a5e] enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="size-[14px]" strokeWidth={2} /> {editing ? "Save" : "Send"}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-ob-slate">Project messages are saved to this workspace.</p>
    </div>
  );
}
