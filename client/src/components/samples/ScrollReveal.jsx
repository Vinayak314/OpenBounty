export default function ScrollReveal({ data }) {
  return (
    <div>
      <h2 className="text-[10px] font-semibold uppercase tracking-[1.5px] text-ob-slate">{data.title}</h2>
      <div className="mt-[18px] flex items-center gap-[52px]">
        <div
          aria-label={data.before}
          className="flex h-[58px] w-[204px] items-center justify-center rounded-[10px] border border-[#f1f5f9] bg-[#f8fafc] font-serif text-[18px] text-ob-slate/50"
        >
          {data.text}
        </div>
        <span aria-hidden="true" className="-ml-[26px] -mr-[26px] text-[12px] text-ob-slate">&rarr;</span>
        <div
          aria-label={data.after}
          className="flex h-[58px] w-[204px] items-center justify-center rounded-[10px] border border-ob-line bg-ob-mist font-serif text-[18px] text-ob-navy"
        >
          {data.text}
        </div>
      </div>
    </div>
  );
}
