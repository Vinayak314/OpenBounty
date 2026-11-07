// Heat level (0-4) -> increasingly darker blue with visible separation.
const LEVEL_COLORS = ["#e7edf5", "#b8cbe2", "#7899c3", "#3e6699", "#09244f"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** GitHub-style full-year contribution grid. */
export default function ContributionActivity({ activity }) {
  const { legend } = activity;

  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-xl border border-ob-line bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 leading-[normal]">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-[22px] font-normal text-ob-navy">{activity.title}</h2>
          <p className="text-[11px] text-[#94a3b8]">{activity.summary}</p>
        </div>
        <p className="text-[10px] text-[#94a3b8]">{activity.rangeLabel}</p>
      </div>

      <div className="max-w-full overflow-x-auto">
        <div className="flex w-fit flex-col gap-2">
        <div
          className="relative h-3 text-[9px] leading-[normal] text-[#94a3b8]"
          style={{ width: `${Math.max(0, activity.weeks.length * 19 - 4)}px`, marginLeft: 38 }}
        >
          {activity.months.map(({ label, weekIndex }) => (
            <span key={`${label}-${weekIndex}`} className="absolute" style={{ left: `${weekIndex * 19}px` }}>{label}</span>
          ))}
        </div>
        <div className="flex gap-[9px]">
          <div className="grid w-[29px] shrink-0 grid-rows-7 gap-1 text-[9px] leading-[15px] text-[#94a3b8]">
            {Array.from({ length: 7 }, (_, index) => (
              <span key={index}>{activity.weekdayLabels.includes(WEEKDAYS[index]) ? WEEKDAYS[index] : ""}</span>
            ))}
          </div>
          <div className="flex gap-1">
            {activity.weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((level, dayIndex) => (
                  <span
                    key={dayIndex}
                    title={activity.dayLabels?.[weekIndex]?.[dayIndex]}
                    className="size-[15px] rounded-[3px] border border-black/5"
                    style={{ backgroundColor: LEVEL_COLORS[level] || LEVEL_COLORS[0] }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-[5px] text-[9px] leading-[normal] text-[#94a3b8]">
          <span>{legend.less}</span>
          {LEVEL_COLORS.map((color) => (
            <span key={color} className="size-2.5 rounded-sm border border-black/10" style={{ backgroundColor: color }} />
          ))}
          <span>{legend.more}</span>
        </div>
        </div>
      </div>
    </section>
  );
}
