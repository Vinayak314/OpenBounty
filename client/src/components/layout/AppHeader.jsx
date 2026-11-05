import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { appNetwork } from "@/data/dashboard";
import { useAuth } from "@/auth/AuthContext";
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

  return (
    <header className={cn("flex shrink-0 items-center justify-between border-b", v.root)}>
      <p className={cn("whitespace-pre leading-[normal]", v.crumbs)}>{crumbs.join(v.separator)}</p>
      <div className={cn("flex items-center", v.utilities)}>
        {variant === "compact" ? (
          <span className="text-[11px] font-medium leading-[normal] text-ob-slate">
            {appNetwork.label}
          </span>
        ) : (
          <span className="rounded-full bg-[#f3f4f6] px-[9px] py-[5px] text-[10px] font-semibold leading-[normal] text-[#6b7280]">
            {appNetwork.label}
          </span>
        )}
        <button type="button" aria-label="Notifications" className={cn("flex", v.bellColor)}>
          <Bell {...iconProps} size={v.bell} />
        </button>
        <InitialsAvatar initials={initials} photoURL={photoURL} className={v.avatar} />
      </div>
    </header>
  );
}
