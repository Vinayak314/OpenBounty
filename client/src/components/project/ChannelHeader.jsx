import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Ellipsis, RotateCcw, Search, X } from "lucide-react";
import { CHANNEL, PROJECT } from "@/data/project";

export default function ChannelHeader({ query, onQuery, onReset, sound, onToggleSound }) {
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const input = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);

  useEffect(() => {
    if (!menu) return;
    const close = (e) => !menuRef.current?.contains(e.target) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const closeSearch = () => {
    setSearching(false);
    onQuery("");
  };
  const item = "flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[11px] hover:bg-ob-mist";

  return (
    <header className="z-20 flex h-[78px] shrink-0 items-center justify-between border-b border-ob-line bg-white/85 px-6 backdrop-blur">
      <div className="min-w-0">
        <h1 className="font-serif text-[26px] leading-none text-ob-navy"># {CHANNEL.name}</h1>
        <p className="mt-[7px] flex items-center gap-[6px] text-[10px] text-ob-slate">
          <span className="relative flex size-[7px]">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-[7px] rounded-full bg-emerald-500" />
          </span>
          {CHANNEL.project} · 5 online
        </p>
      </div>
      <div className="flex items-center gap-3 text-ob-navy">
        <span className="rounded-full bg-ob-mist px-[10px] py-[5px] text-[10px] font-semibold">
          {PROJECT.memberCount} members
        </span>
        <div
          className={`flex h-8 items-center overflow-hidden rounded-full border transition-all duration-300 ${
            searching ? "w-[220px] border-ob-line bg-white px-3" : "w-8 justify-center border-transparent hover:bg-ob-mist"
          }`}
        >
          <button type="button" aria-label="Search messages" onClick={() => setSearching(true)} className="shrink-0">
            <Search className="size-[18px]" strokeWidth={1.8} />
          </button>
          {searching && (
            <>
              <input
                ref={input}
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                placeholder="Search messages"
                className="ml-2 min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-ob-slate"
              />
              <button type="button" aria-label="Close search" onClick={closeSearch}>
                <X className="size-[14px] text-ob-slate" />
              </button>
            </>
          )}
        </div>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="More"
            onClick={() => setMenu((v) => !v)}
            className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-ob-mist"
          >
            <Ellipsis className="size-[18px]" strokeWidth={1.8} />
          </button>
          {menu && (
            <div className="absolute right-0 top-10 w-[190px] animate-[pop_.15s_ease-out] rounded-[12px] border border-ob-line bg-white p-1 shadow-lg">
              <button type="button" onClick={onToggleSound} className={item}>
                {sound ? <BellOff className="size-[14px]" /> : <Bell className="size-[14px]" />}
                {sound ? "Mute sounds" : "Unmute sounds"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setMenu(false);
                }}
                className={item}
              >
                <RotateCcw className="size-[14px]" /> Reset conversation
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
