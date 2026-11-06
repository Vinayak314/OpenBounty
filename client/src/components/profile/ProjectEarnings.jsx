/** Per-project USDT totals. `data` matches projectEarnings in src/data/profile.js. */
export default function ProjectEarnings({ data }) {
  return (
    <section className="flex w-[300px] shrink-0 flex-col gap-[18px] rounded-xl border border-ob-line bg-white p-[22px]">
      <h2 className="whitespace-nowrap font-serif text-xl font-normal leading-[normal] text-ob-navy">
        {data.title}
      </h2>
      <div className="-mt-px h-px w-full bg-ob-line" />
      {data.items.length === 0 && <p className="text-xs text-ob-slate">Project earnings will appear here when OpenBounty activity is connected.</p>}
      {data.items.map((item) => (
        <div key={item.id} className="flex items-center justify-between whitespace-nowrap leading-[normal]">
          <div className="flex flex-col gap-0.5">
            <p className="text-[13px] font-semibold text-ob-navy">{item.name}</p>
            <p className="text-[10px] text-[#94a3b8]">{item.meta}</p>
          </div>
          <p className="font-serif text-xl text-ob-navy">{item.amount}</p>
        </div>
      ))}
    </section>
  );
}
