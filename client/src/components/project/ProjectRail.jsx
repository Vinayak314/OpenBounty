import Avatar from "./Avatar";
import { LEADERBOARD, TASKS } from "@/data/project";

const actionStyles = {
  primary: "bg-ob-navy text-white",
  disabled: "bg-ob-mist text-ob-slate",
};

export default function ProjectRail() {
  return (
    <aside className="w-[338px] shrink-0 overflow-y-auto border-l border-ob-line px-[18px] pb-6 pt-[22px]">
      <h2 className="font-serif text-[24px] leading-tight text-ob-navy">{LEADERBOARD.title}</h2>
      <p className="mt-[14px] text-[10px] text-ob-slate">{LEADERBOARD.subtitle}</p>
      <ol className="mt-[14px] flex flex-col gap-4">
        {LEADERBOARD.entries.map((e) => (
          <li key={e.rank} className="flex h-[30px] items-center text-[12px] text-ob-navy">
            <span className="w-[22px] text-[10px] text-ob-slate">{e.rank}</span>
            <Avatar initials={e.initials} color={e.color} size={30} />
            <span className="ml-[10px]">{e.name}</span>
            <span className="ml-auto text-[13px] font-semibold">{e.amount}</span>
          </li>
        ))}
      </ol>

      <div className="my-5 h-px bg-ob-line" />

      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[26px] leading-none text-ob-navy">
          {TASKS.title} <span className="text-[16px] text-ob-slate">{TASKS.items.length}</span>
        </h2>
        <button type="button" className="h-8 rounded-[8px] bg-ob-navy px-3 text-[11px] font-semibold text-white">
          {TASKS.createLabel}
        </button>
      </div>

      <ul className="mt-[14px] flex flex-col gap-[14px]">
        {TASKS.items.map((t) => (
          <li key={t.id} className="h-[134px] rounded-[14px] border border-ob-line bg-[#f8fafc] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-ob-slate">#{t.id}</span>
              <span className="rounded-full bg-ob-mist px-[10px] py-[5px] text-[10px] font-semibold text-ob-navy">{t.status}</span>
            </div>
            <p className="mt-[10px] text-[12px] font-semibold text-ob-navy">{t.title}</p>
            <p className="mt-[10px] text-[10px] text-ob-slate">{t.detail}</p>
            <div className="mt-[10px] flex items-center justify-between">
              <span className="font-serif text-[22px] leading-none text-ob-navy">
                {t.amount} <span className="font-sans text-[9px] text-ob-slate">USDC</span>
              </span>
              <span className={`flex h-8 items-center rounded-[8px] px-3 text-[11px] font-semibold ${actionStyles[t.action.kind]}`}>
                {t.action.label}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[10px] leading-[14px] text-ob-slate">{TASKS.footnote}</p>
    </aside>
  );
}
