import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavDrawerContext, useNavDrawer } from "./navDrawerState";

export function NavDrawerProvider({ children }) {
  const { pathname } = useLocation();
  // The open panel remembers the page it was opened on, so moving to another page closes it without an effect.
  const [state, setState] = useState({ panel: null, pathname });
  const panel = state.pathname === pathname ? state.panel : null;
  const setPanel = useCallback((next) => setState({ panel: next, pathname }), [pathname]);

  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (event) => event.key === "Escape" && setPanel(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, setPanel]);

  // Growing to a desktop layout leaves no drawer to close, so drop the open state.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const reset = () => query.matches && setPanel(null);
    query.addEventListener("change", reset);
    return () => query.removeEventListener("change", reset);
  }, [setPanel]);

  const value = useMemo(() => ({ panel, setPanel }), [panel, setPanel]);
  return <NavDrawerContext.Provider value={value}>{children}</NavDrawerContext.Provider>;
}

/** Dim layer behind an open drawer. Tapping it closes the drawer. Hidden once the layout is wide enough. */
export function DrawerBackdrop({ name, breakpoint = "md" }) {
  const { panel, close } = useNavDrawer();
  if (panel !== name) return null;
  return (
    <div
      aria-hidden="true"
      onClick={close}
      className={cn("fixed inset-0 z-40 animate-[fade_.2s_ease-out] bg-ob-navy/50", breakpoint === "lg" ? "lg:hidden" : "md:hidden")}
    />
  );
}

/** Hamburger button that opens the left navigation. Only shown on narrow screens. */
export function NavMenuButton({ className, breakpoint = "md" }) {
  const { panel, open } = useNavDrawer();
  return (
    <button
      type="button"
      aria-label="Open menu"
      aria-expanded={panel === "nav"}
      onClick={() => open("nav")}
      className={cn("-ml-1 flex size-10 shrink-0 items-center justify-center rounded-full text-ob-navy transition-colors hover:bg-ob-mist active:scale-95", breakpoint === "lg" ? "lg:hidden" : "md:hidden", className)}
    >
      <Menu className="size-5" strokeWidth={1.8} />
    </button>
  );
}
