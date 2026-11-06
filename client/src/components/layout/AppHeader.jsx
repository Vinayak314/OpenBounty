import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { appNetwork, notifications } from "@/data/dashboard";
import { useAuth } from "@/auth/AuthContext";
import WalletBalanceChip from "@/components/wallet/WalletBalanceChip";
import InitialsAvatar from "./InitialsAvatar";
import { iconProps } from "./icon";

const VARIANTS = {
  default: {
    root: "h-[72px] border-[#e5e7eb] bg-white px-9",
    crumbs: "text-[13px] text-[#9ca3af]",
    separator: " / ",
    utilities: "gap-[18px]",
    bell: 18,
    bellColor: "text-[#6b7280]",
    avatar: "size-[30px] text-[9.6px]",
  },
  compact: {
    root: "h-16 border-ob-line bg-[#f8fafc] px-8",
    crumbs: "text-xs text-[#94a3b8]",
    separator: "  /  ",
    utilities: "gap-4",
    bell: 16,
    bellColor: "text-ob-slate",
    avatar: "size-7 text-[9px]",
  },
};

/**
 * Top bar of the signed-in app.
 * Props:
 *  - crumbs:  breadcrumb labels, e.g. ["Workspace", "Dashboard"].
 *  - variant: "default" (72px, chip) or "compact" (64px, plain network label).
 * Network label and user come from src/data/dashboard.js.
 */
export default function AppHeader({ crumbs, variant = "default" }) {
  const v = VARIANTS[variant] ?? VARIANTS.default;
  const { initials, photoURL } = useAuth();
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(() => new Set());
  const ref = useRef(null);
  const unread = notifications.filter((n) => !read.has(n.id)).length;

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <header className={cn("flex shrink-0 items-center justify-between border-b", v.root)}>
      <p className={cn("whitespace-pre leading-[normal]", v.crumbs)}>
        {crumbs.map((c, i) => (
          <span key={`${c}-${i}`}>
            {i > 0 && v.separator}
            {i === 0 && crumbs.length > 1 ? (
              <Link to="/dashboard" className="transition-colors hover:text-ob-navy hover:underline">{c}</Link>
            ) : (
              c
            )}
          </span>
        ))}
      </p>
      <div className={cn("flex items-center", v.utilities)}>
        <WalletBalanceChip />
        {variant === "compact" ? (
          <span className="text-[11px] font-medium leading-[normal] text-ob-slate">
            {appNetwork.label}
          </span>
        ) : (
          <span className="rounded-full bg-[#f3f4f6] px-[9px] py-[5px] text-[10px] font-semibold leading-[normal] text-[#6b7280]">
            {appNetwork.label}
          </span>
        )}
        <div className="relative" ref={ref}>
          <button
            type="button"
            aria-label="Notifications"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn("relative flex rounded-full p-1.5 transition-all duration-150 hover:bg-ob-mist hover:text-ob-navy active:scale-90", v.bellColor)}
          >
            <Bell {...iconProps} size={v.bell} className={unread ? "origin-top hover:animate-[wiggle_.5s_ease-in-out]" : ""} />
            {unread > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-orange-500 ring-2 ring-white" />}
          </button>
          {open && (
            <div className="absolute right-0 top-11 z-40 w-[300px] animate-[pop_.15s_ease-out] rounded-xl border border-[#e5e7eb] bg-white p-2 shadow-xl">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-semibold text-ob-navy">Notifications</span>
                <button type="button" disabled={!unread} onClick={() => setRead(new Set(notifications.map((n) => n.id)))} className="text-[11px] text-ob-slate enabled:hover:text-ob-navy enabled:hover:underline disabled:opacity-50">
                  Mark all read
                </button>
              </div>
              <ul className="mt-1 flex flex-col">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={n.to}
                      onClick={() => {
                        setRead((r) => new Set(r).add(n.id));
                        setOpen(false);
                      }}
                      className="flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-ob-mist"
                    >
                      <span className={cn("mt-[5px] size-2 shrink-0 rounded-full", read.has(n.id) ? "bg-transparent" : "bg-orange-500")} />
                      <span className="min-w-0 flex-1 leading-[normal]">
                        <span className="block text-xs font-semibold text-ob-navy">{n.title}</span>
                        <span className="block truncate text-[11px] text-ob-slate">{n.body}</span>
                      </span>
                      <span className="text-[10px] text-ob-slate">{n.time}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <InitialsAvatar initials={initials} photoURL={photoURL} className={v.avatar} />
      </div>
    </header>
  );
}
