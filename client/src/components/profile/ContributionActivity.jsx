import { cn } from "@/lib/utils";

// Heat level (0-3) -> cell colour.
const LEVEL_COLORS = ["bg-[#f8fafc]", "bg-[#dce5ef]", "bg-[#9bafc9]", "bg-ob-navy"];

/** GitHub-style yearly calendar. `activity` matches contributionActivity in src/data/profile.js. */
export default function ContributionActivity({ activity }) {
  const { legend } = activity;

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-ob-line bg-white p-6">
      <div className="flex items-center justify-between whitespace-nowrap leading-[normal]">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-[22px] font-normal text-ob-navy">{activity.title}</h2>
          <p className="text-[11px] text-[#94a3b8]">{activity.summary}</p>
        </div>
        <p className="text-[10px] text-[#94a3b8]">{activity.rangeLabel}</p>
      </div>

      <div className="flex flex-col gap-2 overflow-x-auto">
        <div className="flex min-w-max justify-between pl-[38px] pr-5 text-[9px] leading-[normal] text-[#94a3b8]">
          {activity.months.map((month) => (
            <span key={month}>{month}</span>
          ))}
        </div>
        <div className="flex min-w-max gap-[9px]">
          <div className="flex w-[29px] shrink-0 flex-col gap-[21px] pt-[18px] text-[9px] leading-[normal] text-[#94a3b8]">
            {activity.weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="flex gap-1">
            {activity.weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((level, dayIndex) => (
                  <span
                    key={dayIndex}
                    className={cn("size-[15px] rounded-[3px]", LEVEL_COLORS[level])}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-[5px] text-[9px] leading-[normal] text-[#94a3b8]">
          <span>{legend.less}</span>
          {LEVEL_COLORS.map((color) => (
            <span key={color} className={cn("size-2.5 rounded-sm", color)} />
          ))}
          <span>{legend.more}</span>
        </div>
      </div>
    </section>
  );
}
