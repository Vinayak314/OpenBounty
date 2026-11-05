import messagesSquare from "@/assets/landing/messagesSquare.svg";
import gitBranch from "@/assets/landing/gitBranch.svg";
import { Link } from "react-router-dom";
import { SHARED_SPACE, CONVERSATION_PREVIEW } from "@/data/landing";

const ICONS = { messagesSquare, gitBranch };

function ConversationPreview() {
  const { title, status, messages, agreement } = CONVERSATION_PREVIEW;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[22px] rounded-3xl border-[3px] border-[#eec84b] bg-[#fffcf5] p-[26px]">
      <div className="flex items-center justify-between gap-3">
        <p className="font-serif text-[26px] leading-[26px] text-ob-navy">{title}</p>
        <span className="shrink-0 rounded-full bg-[#dde4f0] px-[9px] py-[5px] text-[10px] font-semibold text-ob-navy">
          {status}
        </span>
      </div>
      <div className="h-px w-full bg-[#d9ded1]" />
      {messages.map((m) => (
        <div key={m.id} className="flex items-start gap-3">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-[10.24px] font-semibold text-[#fffcf5]"
            style={{ backgroundColor: m.avatarColor }}
          >
            {m.initials}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <p className="text-xs font-semibold text-ob-navy">{m.author}</p>
            <p className="text-sm leading-[1.6] text-[#0d2a56]">{m.text}</p>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 rounded-[14px] bg-[#dde4f0] p-[18px]">
        <div className="flex flex-col gap-[6px]">
          <p className="text-[13px] font-semibold text-ob-navy">{agreement.issue}</p>
          <p className="text-[11px] text-[#6b7a99]">{agreement.meta}</p>
        </div>
        <p className="whitespace-nowrap font-serif text-[25px] text-ob-navy">{agreement.reward}</p>
      </div>
    </div>
  );
}

export default function SharedSpace() {
  return (
    <div id="for-maintainers" className="flex flex-col items-stretch gap-10 lg:flex-row lg:items-center lg:gap-20">
      <div className="flex w-full flex-col gap-[22px] lg:w-[510px] lg:shrink-0">
        <p className="text-[11px] font-semibold tracking-[2px] text-[#2b5fc9]">{SHARED_SPACE.eyebrow}</p>
        <h2 className="font-serif text-[36px] font-normal leading-[1.12] tracking-[-1.2px] text-ob-navy sm:text-[49px] sm:tracking-[-1.6px]">
          {SHARED_SPACE.headingLine1}
          <br />
          {SHARED_SPACE.headingPrefix}
          <span className="text-[#5b8dd9]">{SHARED_SPACE.headingAccent}</span>
        </h2>
        <p className="text-[15px] leading-[1.7] text-[#6b7a99]">{SHARED_SPACE.body}</p>
        <ul className="flex gap-6">
          {SHARED_SPACE.benefits.map((b) => (
            <li key={b.id} className="flex items-center gap-[7px] text-xs text-ob-navy">
              <img alt="" src={ICONS[b.icon]} className="size-4" />
              {b.label}
            </li>
          ))}
        </ul>
        <Link to="/connect" className="text-[13px] font-semibold text-[#2b5fc9]">
          {SHARED_SPACE.ctaLabel}
        </Link>
      </div>
      <ConversationPreview />
    </div>
  );
}
