import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown, Check, CheckCheck, Copy, CornerUpLeft, FileText, GitPullRequest, Pencil, Pin, SmilePlus, Sparkles, Trash2,
} from "lucide-react";
import Avatar from "./Avatar";
import EvidenceReport from "./EvidenceReport";
import { CHANNEL } from "@/data/project";

const EMOJIS = ["👍", "🎉", "👀", "❤️"];

function Byline({ m }) {
  const { author, time, me, status, edited } = m;
  return (
    <div className={`flex items-center gap-2 ${me ? "justify-end" : ""}`}>
      <span className="text-[12px] font-semibold text-ob-navy">{author.name}</span>
      {author.agent && (
        <span className="rounded-full bg-ob-mist px-[10px] py-[5px] text-[10px] font-semibold text-ob-navy">AI</span>
      )}
      <span className="text-[10px] text-ob-slate">{time}{edited && " · edited"}</span>
      {me && (
        <span className="text-ob-slate" title={status}>
          {status === "seen" ? <CheckCheck className="size-3 text-sky-500" /> : status === "sent" ? <Check className="size-3" /> : status === "sending" ? <span className="text-[9px]">sending…</span> : null}
        </span>
      )}
    </div>
  );
}

function Body({ text }) {
  return text.split(/(@[A-Z][\w]*(?: [A-Z][\w]*)?|@[a-z]+ agent)/gi).map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="rounded bg-sky-100 px-1 font-medium text-sky-800">{part}</span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function ActionBtn({ label, onClick, children, danger }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-[6px] p-[5px] transition-colors ${danger ? "text-rose-600 hover:bg-rose-50" : "text-ob-slate hover:bg-ob-mist hover:text-ob-navy"}`}
    >
      {children}
    </button>
  );
}

function Toolbar({ m, onReact, onReply, onEdit, onDelete }) {
  const [picker, setPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const canCopy = m.type === "message";

  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 2500);
    return () => clearTimeout(t);
  }, [confirm]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className={`absolute -top-3 z-10 flex items-center gap-[2px] rounded-[10px] border border-ob-line bg-white px-1 py-[2px] shadow-sm transition-opacity ${m.me ? "left-0" : "right-0"} ${
        picker || confirm ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
      }`}
    >
      {picker ? (
        EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => { onReact(m.id, e); setPicker(false); }} className="px-[3px] text-[15px] transition-transform hover:scale-125">
            {e}
          </button>
        ))
      ) : (
        <>
          <ActionBtn label="Add reaction" onClick={() => setPicker(true)}><SmilePlus className="size-[14px]" /></ActionBtn>
          <ActionBtn label="Reply" onClick={() => onReply(m)}><CornerUpLeft className="size-[14px]" /></ActionBtn>
          {canCopy && (
            <ActionBtn label={copied ? "Copied" : "Copy text"} onClick={copy}>
              {copied ? <Check className="size-[14px] text-emerald-600" /> : <Copy className="size-[14px]" />}
            </ActionBtn>
          )}
          {m.me && (
            <>
              <ActionBtn label="Edit" onClick={() => onEdit(m)}><Pencil className="size-[14px]" /></ActionBtn>
              {confirm ? (
                <button type="button" onClick={() => onDelete(m.id)} className="rounded-[6px] bg-rose-600 px-2 py-[3px] text-[10px] font-semibold text-white">
                  Delete?
                </button>
              ) : (
                <ActionBtn label="Delete" danger onClick={() => setConfirm(true)}><Trash2 className="size-[14px]" /></ActionBtn>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Reactions({ m, onReact }) {
  const entries = Object.entries(m.reactions || {});
  if (!entries.length) return null;
  return (
    <div className={`mt-[6px] flex flex-wrap gap-[6px] ${m.me ? "justify-end" : ""}`}>
      {entries.map(([emoji, r]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(m.id, emoji)}
          className={`flex animate-[pop_.15s_ease-out] items-center gap-1 rounded-full border px-2 py-[2px] text-[11px] transition-transform active:scale-90 ${
            r.mine ? "border-sky-400 bg-sky-50" : "border-ob-line bg-white hover:bg-ob-mist"
          }`}
        >
          {emoji} <span className="text-[10px] font-semibold">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

function Message({ m, actions, onJump }) {
  if (m.type === "event") {
    return (
      <div className="flex items-center gap-2 pl-[43px] text-[11px]">
        <GitPullRequest className="size-4 text-ob-navy" strokeWidth={1.8} />
        <span className="font-semibold text-ob-navy">{m.title}</span>
        <span className="text-[10px] text-ob-slate">{m.meta}</span>
      </div>
    );
  }
  const avatar = m.author.agent ? (
    <Avatar size={32}><Sparkles className="size-[18px]" strokeWidth={1.7} /></Avatar>
  ) : (
    <Avatar initials={m.author.initials} color={m.author.color} size={32} />
  );
  return (
    <div className={`group relative flex items-start gap-[11px] ${m.me ? "flex-row-reverse" : ""}`}>
      <Toolbar m={m} {...actions} />
      {avatar}
      <div className={`min-w-0 ${m.type === "report" ? "flex-1" : "max-w-[78%]"} ${m.me ? "flex flex-col items-end" : ""}`}>
        <Byline m={m} />
        {m.replyTo && (
          <button
            type="button"
            onClick={() => onJump(m.replyTo.id)}
            className="mt-[7px] flex max-w-full items-center gap-[6px] border-l-2 border-sky-400 pl-2 text-left text-[10px] text-ob-slate hover:text-ob-navy"
          >
            <CornerUpLeft className="size-3 shrink-0" />
            <span className="truncate"><b>{m.replyTo.author}</b> {m.replyTo.snippet}</span>
          </button>
        )}
        {m.type === "report" ? (
          <div className="mt-[9px]"><EvidenceReport report={m.report} /></div>
        ) : (
          <p
            className={`mt-[9px] whitespace-pre-wrap break-words rounded-[14px] px-3 py-[11px] text-[12px] leading-5 text-ob-navy ${
              m.me ? "bg-ob-mist" : m.variant === "outlined" ? "border border-ob-line" : "bg-white"
            }`}
          >
            <Body text={m.body} />
          </p>
        )}
        {m.attachments?.map((a, i) => {
          const f = typeof a === "string" ? { name: a } : a;
          return f.preview ? (
            <img key={i} src={f.preview} alt={f.name} className="mt-[6px] max-h-[180px] max-w-full rounded-[12px] border border-ob-line object-cover" />
          ) : (
            <span key={i} className="mt-[6px] inline-flex items-center gap-[6px] rounded-[10px] border border-ob-line bg-white px-[10px] py-[6px] text-[10px]">
              <FileText className="size-3" /> {f.name}
            </span>
          );
        })}
        <Reactions m={m} onReact={actions.onReact} />
      </div>
    </div>
  );
}

function Typing({ who }) {
  const agent = who === "Bounty agent";
  return (
    <div className="flex items-start gap-[11px]">
      {agent ? (
        <Avatar size={32}><Sparkles className="size-[18px]" strokeWidth={1.7} /></Avatar>
      ) : (
        <Avatar initials={who.split(" ").map((w) => w[0]).join("")} size={32} />
      )}
      <div>
        <p className="text-[12px] font-semibold text-ob-navy">
          {who} <span className="text-[10px] font-normal text-ob-slate">{agent ? "is reviewing…" : "is typing…"}</span>
        </p>
        <div className="mt-[9px] flex w-fit gap-1 rounded-[14px] bg-white px-4 py-[14px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-[6px] animate-bounce rounded-full bg-ob-slate" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatThread({ messages, typing, query, onReact, onReply, onEdit, onDelete }) {
  const scroller = useRef(null);
  const bottom = useRef(null);
  const stick = useRef(true);
  const prevIds = useRef(new Set(messages.map((m) => m.id)));
  const [unread, setUnread] = useState(0);
  const [flash, setFlash] = useState(null);

  const q = query.trim().toLowerCase();
  const visible = q ? messages.filter((m) => m.type === "message" && m.body.toLowerCase().includes(q)) : messages;

  const toBottom = (smooth = true) => bottom.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });

  useLayoutEffect(() => {
    toBottom(false);
  }, []);

  useEffect(() => {
    const added = messages.filter((m) => !prevIds.current.has(m.id));
    prevIds.current = new Set(messages.map((m) => m.id));
    if (!added.length) return;
    if (stick.current || added.some((m) => m.me)) toBottom();
    else setUnread((n) => n + added.filter((m) => !m.me).length);
  }, [messages]);

  useEffect(() => {
    if (stick.current) toBottom();
  }, [typing]);

  const onScroll = () => {
    const el = scroller.current;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = near;
    if (near) setUnread(0);
  };

  const jump = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => setFlash(null), 1600);
  };

  const actions = { onReact, onReply, onEdit, onDelete };

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} id="general" className="h-full overflow-y-auto scroll-smooth px-6 pb-4 pt-[14px]">
        <div className="sticky top-0 z-10 -mx-1 bg-[#f8fafc] px-1 pb-3">
          <div className="flex h-10 items-center gap-[10px] rounded-[10px] border border-ob-line bg-[#f8fafc] px-[10px] text-[11px] text-ob-navy">
            <Pin className="size-4" strokeWidth={1.8} />
            <span>{CHANNEL.pinned.text}</span>
            <button type="button" className="ml-auto font-semibold hover:underline">{CHANNEL.pinned.action} &rarr;</button>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <p className="text-center text-[10px] text-ob-slate">{CHANNEL.dateLabel}</p>
          {q && visible.length === 0 && <p className="py-10 text-center text-[12px] text-ob-slate">No messages match “{query}”.</p>}
          {visible.map((m) => (
            <div
              key={m.id}
              id={`msg-${m.id}`}
              className={`-mx-2 animate-[rise_.25s_ease-out] rounded-[14px] px-2 py-1 ${flash === m.id ? "animate-[flash_1.6s_ease-out]" : ""}`}
            >
              <Message m={m} actions={actions} onJump={jump} />
            </div>
          ))}
          {typing && <div className="animate-[rise_.25s_ease-out]"><Typing who={typing} /></div>}
          <div ref={bottom} />
        </div>
      </div>
      {unread > 0 && (
        <button
          type="button"
          onClick={() => toBottom()}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 animate-[rise_.2s_ease-out] items-center gap-1 rounded-full bg-ob-navy px-3 py-[7px] text-[11px] font-semibold text-white shadow-lg"
        >
          <ArrowDown className="size-3" /> {unread} new {unread === 1 ? "message" : "messages"}
        </button>
      )}
    </div>
  );
}
