/** Four-up lifetime metrics. `stats` matches profileStats in src/data/profile.js. */
export default function ImpactStats({ stats, loading = false }) {
  return (
    <section aria-label="GitHub stats" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.id}
          className="flex min-w-0 flex-1 flex-col items-start gap-2 rounded-[10px] border border-ob-line bg-white p-5 leading-[normal]"
        >
          <p className="whitespace-nowrap text-[10px] text-[#94a3b8]">{stat.label}</p>
          <p className="whitespace-nowrap font-serif text-[32px] text-ob-navy">{loading ? "…" : stat.value}</p>
          <p className="text-[10px] text-[#94a3b8]">{stat.caption}</p>
        </div>
      ))}
    </section>
  );
}
