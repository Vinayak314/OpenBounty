import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Ellipsis, Info, Search, X } from "lucide-react";
import WalletBalanceChip from "@/components/wallet/WalletBalanceChip";
import { NavMenuButton } from "@/components/layout/NavDrawer";
import { useNavDrawer } from "@/components/layout/navDrawerState";

const SUBTITLES = {
  chat: "Talk with members and the 0G agent. Type / for commands.",
  bounties: "Fund, claim and pay out bounties for this repository.",
  activity: "Every 0G request this project has made.",
};

export default function ChannelHeader({ title, view = "chat", query, onQuery, sound, onToggleSound, connectionStatus }) {
  const { open } = useNavDrawer();
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const input = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => { if (searching) input.current?.focus(); }, [searching]);
  useEffect(() => {
    if (!menu) return;
    const close = (event) => !menuRef.current?.contains(event.target) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  const closeSearch = () => { setSearching(false); onQuery(""); };
  const item = "flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-[11px] hover:bg-ob-mist";

  return (
    <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-ob-line bg-white/85 px-3 backdrop-blur sm:gap-4 sm:px-6 md:h-[78px]">
      <div className="flex min-w-0 items-center gap-1">
        <NavMenuButton />
        <div className="min-w-0">
          <h1 className="truncate font-serif text-[22px] leading-none text-ob-navy sm:text-[26px]">{title}</h1>
          <p className="mt-[7px] hidden truncate text-[10px] text-ob-slate sm:block">{SUBTITLES[view]}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-ob-navy sm:gap-3">
        <WalletBalanceChip />
        <span className="flex items-center gap-1.5 rounded-full bg-ob-mist px-[8px] py-[5px] text-[10px] font-semibold sm:px-[10px]" title={connectionStatus} aria-label={`Chat connection: ${connectionStatus}`}>
          <span className={`size-1.5 rounded-full ${connectionStatus === "connected" ? "bg-emerald-500" : connectionStatus === "offline" ? "bg-rose-500" : "animate-pulse bg-amber-500"}`} />
          <span className="hidden sm:inline">{connectionStatus === "connected" ? "Live" : connectionStatus === "offline" ? "Offline" : "Connecting"}</span>
        </span>
        {view === "chat" && <div className={`flex h-8 items-center overflow-hidden rounded-full border transition-all duration-300 ${searching ? "w-[150px] border-ob-line bg-white px-3 sm:w-[220px]" : "w-8 justify-center border-transparent hover:bg-ob-mist"}`}>
          <button type="button" aria-label="Search messages" onClick={() => setSearching(true)} className="shrink-0"><Search className="size-[18px]" strokeWidth={1.8} /></button>
          {searching && <><input ref={input} value={query} onChange={(event) => onQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && closeSearch()} placeholder="Search messages" className="ml-2 min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-ob-slate" /><button type="button" aria-label="Close search" onClick={closeSearch}><X className="size-[14px] text-ob-slate" /></button></>}
        </div>}
        <button type="button" aria-label="Project details" onClick={() => open("details")} className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-ob-mist lg:hidden"><Info className="size-[18px]" strokeWidth={1.8} /></button>
        <div className="relative" ref={menuRef}>
          <button type="button" aria-label="More" onClick={() => setMenu((value) => !value)} className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-ob-mist"><Ellipsis className="size-[18px]" strokeWidth={1.8} /></button>
          {menu && <div className="absolute right-0 top-10 w-[190px] animate-[pop_.15s_ease-out] rounded-[12px] border border-ob-line bg-white p-1 shadow-lg"><button type="button" onClick={() => { onToggleSound(); setMenu(false); }} className={item}>{sound ? <BellOff className="size-[14px]" /> : <Bell className="size-[14px]" />}{sound ? "Mute sounds" : "Unmute sounds"}</button></div>}
        </div>
      </div>
    </header>
  );
}
