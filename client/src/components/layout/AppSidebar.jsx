import { NavLink } from "react-router-dom";
import { CircleHelp, LayoutDashboard, Sprout, UserRound } from "lucide-react";
import logoMark from "@/assets/app/logo-mark.svg";
import { cn } from "@/lib/utils";
import { currentUser, navItems, sidebarNote } from "@/data/dashboard";
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

  return (
    <aside
      style={{ width: width ?? v.width }}
      className={cn(
        "sticky top-0 flex h-screen min-h-[640px] shrink-0 flex-col bg-ob-navy font-sans",
        v.root,
      )}
    >
      <div className="flex items-center gap-[10px]">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-ob-line">
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
      </div>

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
                  "flex items-center gap-3 px-3 transition-colors hover:bg-[#0f2a5a]/60",
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
                      className={cn("shrink-0", on ? v.activeIcon : v.inactiveIcon)}
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
        <div className="flex flex-col gap-[10px] rounded-[14px] border border-[#294064] p-4">
          <Sprout {...iconProps} size={25} className="text-white" />
          <p className="font-serif text-xl leading-[normal] text-[#f8fafc]">{sidebarNote.title}</p>
          <p className="text-[11px] leading-[1.6] text-[#cbd5e1]">{sidebarNote.body}</p>
        </div>
      )}

      <div className="absolute bottom-7 left-5 right-0 flex flex-col gap-4">
        <div className={cn("flex items-center", v.helpGap)}>
          <CircleHelp {...iconProps} size={v.helpIconSize} className={v.helpColor} />
          <span className={cn("text-xs", v.helpColor)}>{v.helpLabel}</span>
        </div>
        <div className="flex items-center gap-[10px]">
          <InitialsAvatar initials={currentUser.initials} className={v.avatar} />
          <div className={cn("flex flex-col leading-[normal]", v.identityGap)}>
            <span className="text-xs font-semibold text-[#f8fafc]">{currentUser.name}</span>
            <span className={cn("text-[10px]", v.handleColor)}>{currentUser.handle}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
