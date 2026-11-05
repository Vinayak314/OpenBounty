// A 1px rule; the design places it with the row gaps either side (16px above/below).
function Rule() {
  return <div className="-mt-px h-px w-full shrink-0 bg-ob-line" />;
}

/** Completed bounty list. `data` matches recentBounties in src/data/profile.js. */
export default function RecentBounties({ data }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl border border-ob-line bg-white p-[22px]">
      <div className="flex items-center justify-between whitespace-nowrap leading-[normal]">
        <h2 className="font-serif text-xl font-normal text-ob-navy">{data.title}</h2>
        <span className="text-[10px] text-[#94a3b8]">{data.statusLabel}</span>
      </div>
      {data.items.map((item) => (
        <div key={item.id} className="contents">
          <Rule />
          <div className="flex items-center gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-[3px] whitespace-nowrap leading-[normal]">
              <p className="text-[13px] font-semibold text-ob-navy">{item.title}</p>
              <p className="text-[10px] text-[#94a3b8]">{item.meta}</p>
            </div>
            <p className="whitespace-nowrap text-[13px] font-semibold leading-[normal] text-ob-navy">
              {item.amount}
            </p>
            <span className="rounded-full bg-ob-mist px-2 py-[3px] text-[10px] font-semibold leading-[normal] text-ob-slate">
              {item.status}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}
