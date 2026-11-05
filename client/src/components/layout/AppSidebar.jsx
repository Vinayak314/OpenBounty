import { Link, NavLink } from "react-router-dom";
import { CircleHelp, LayoutDashboard, Sprout, UserRound } from "lucide-react";
import logoMark from "@/assets/app/logo-mark.svg";
import { cn } from "@/lib/utils";
import { navItems, sidebarNote } from "@/data/dashboard";
import { useAuth } from "@/auth/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../../../firebase/firebase";
import InitialsAvatar from "./InitialsAvatar";
import { iconProps } from "./icon";

const NAV_ICONS = { dashboard: LayoutDashboard, profile: UserRound };

// Two sidebar sizes exist in the design: the roomy Dashboard one (220px) and
// the compact Profile one (200px).
const VARIANTS = {
  default: {
    width: 220,
    root: "gap-6 px-5 py-6",
    brandText: "text-[25px]",
    nav: "gap-2",
    item: "h-11 rounded-lg",
    itemText: "text-sm",
    iconSize: 20,
    activeItem: "bg-[#0f2a5a] font-semibold text-[#f8fafc]",
    inactiveItem: "font-normal text-[#f8fafc]",
    activeIcon: "text-white",
    inactiveIcon: "text-[#f8fafc]",
    showNote: true,
    helpLabel: "Help & community",
    helpIconSize: 17,
    helpGap: "gap-[10px]",
    helpColor: "text-[#cbd5e1]",
    avatar: "size-8 text-[10.24px]",
    identityGap: "gap-1",
    handleColor: "text-[#cbd5e1]",
  },
  compact: {
    width: 200,
    root: "gap-8 px-5 py-7",
    brandText: "text-[22px]",
    nav: "gap-1",
    item: "h-10 rounded-md",
    itemText: "text-[13px]",
    iconSize: 18,
    activeItem: "bg-[#0f2a5c] font-semibold text-[#f8fafc]",
    inactiveItem: "font-normal text-[#94a3b8]",
    activeIcon: "text-[#e2e8f0]",
    inactiveIcon: "text-[#94a3b8]",
    showNote: false,
    helpLabel: "Help",
    helpIconSize: 15,
    helpGap: "gap-2",
    helpColor: "text-ob-slate",
    avatar: "size-[30px] text-[10px]",
    identityGap: "gap-0.5",
    handleColor: "text-ob-slate",
  },
};

/**
 * Left navy app sidebar shared by Dashboard, Profile and the Project workspace.
 *
 * Props:
 *  - active:  nav item id ("dashboard" | "profile") to highlight. Omit it to
 *             let react-router decide from the current URL (use it on pages
 *             that are not in the nav, e.g. "/project", with active={undefined}).
 *  - variant: "default" (220px, with the community note) or "compact" (200px).
 *  - width:   optional pixel width override.
 *
 * Nav items and the signed-in user come from src/data/dashboard.js.
 */
export default function AppSidebar({ active, variant = "default", width }) {
  const v = VARIANTS[variant] ?? VARIANTS.default;
  const { name, handle, initials, photoURL, githubUrl } = useAuth();

  return (
    <aside
      style={{ width: width ?? v.width }}
      className={cn(
        "sticky top-0 flex h-screen min-h-[640px] shrink-0 flex-col bg-ob-navy font-sans",
        v.root,
      )}
    >
      <Link to="/" aria-label="OpenBounty home" className="group flex items-center gap-[10px] outline-none">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-ob-line transition-transform duration-300 group-hover:rotate-[20deg] group-hover:scale-110">
          <img src={logoMark} alt="" className="size-[25px]" />
        </span>
        <span
          className={cn(
            "font-serif font-bold leading-[normal] tracking-[-0.8px] text-[#f8fafc]",
            v.brandText,
          )}
        >
          OpenBounty
        </span>
      </Link>

      <nav aria-label="Main" className={cn("flex flex-col", v.nav)}>
        {navItems.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          return (
            <NavLink
              key={item.id}
              to={item.to}
              className={({ isActive }) => {
                const on = active ? item.id === active : isActive;
                return cn(
                  "group flex items-center gap-3 px-3 transition-all duration-200 hover:translate-x-1 hover:bg-[#0f2a5a]/60 active:scale-[0.98]",
                  v.item,
                  v.itemText,
                  on ? v.activeItem : v.inactiveItem,
                );
              }}
            >
              {({ isActive }) => {
                const on = active ? item.id === active : isActive;
                return (
                  <>
                    <Icon
                      {...iconProps}
                      size={v.iconSize}
                      className={cn("shrink-0 transition-transform duration-200 group-hover:scale-110", on ? v.activeIcon : v.inactiveIcon)}
                    />
                    {item.label}
                  </>
                );
              }}
            </NavLink>
          );
        })}
      </nav>

      {v.showNote && (
        <Link to="/project" className="group flex flex-col gap-[10px] rounded-[14px] border border-[#294064] p-4 outline-none transition-all duration-200 hover:-translate-y-1 hover:border-[#4a6591] hover:bg-[#0f2a5a]/50 focus-visible:ring-2 focus-visible:ring-white/50">
          <Sprout {...iconProps} size={25} className="text-white transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-125" />
          <p className="font-serif text-xl leading-[normal] text-[#f8fafc]">{sidebarNote.title}</p>
          <p className="text-[11px] leading-[1.6] text-[#cbd5e1]">{sidebarNote.body}</p>
        </Link>
      )}

      <div className="absolute bottom-7 left-5 right-5 flex flex-col gap-4">
        <Link to="/project" className={cn("group flex items-center transition-colors hover:text-white", v.helpGap, v.helpColor)}>
          <CircleHelp {...iconProps} size={v.helpIconSize} className="transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />
          <span className="text-xs group-hover:underline">{v.helpLabel}</span>
        </Link>
        <div className="flex min-w-0 items-center gap-[10px]">
          {githubUrl ? (
            <a href={githubUrl} target="_blank" rel="noreferrer" aria-label="Open GitHub profile">
              <InitialsAvatar initials={initials} photoURL={photoURL} className={v.avatar} />
            </a>
          ) : <InitialsAvatar initials={initials} photoURL={photoURL} className={v.avatar} />}
          <div className={cn("flex min-w-0 flex-1 flex-col leading-[normal]", v.identityGap)}>
            <span title={name} className="truncate text-xs font-semibold text-[#f8fafc]">{name}</span>
            {githubUrl ? <a title={handle} href={githubUrl} target="_blank" rel="noreferrer" className={cn("truncate text-[10px] hover:underline", v.handleColor)}>{handle}</a> : <span title={handle} className={cn("truncate text-[10px]", v.handleColor)}>{handle}</span>}
          </div>
          <button type="button" onClick={() => signOut(auth)} className="shrink-0 rounded px-1 text-[10px] text-[#cbd5e1] transition-colors hover:bg-white/10 hover:text-white active:scale-95">Sign out</button>
        </div>
      </div>
    </aside>
  );
}
