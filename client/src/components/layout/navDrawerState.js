import { createContext, useCallback, useContext, useEffect } from "react";

// On phones the left navigation and the project details panel slide in over the page instead of taking
// space from it. Which one is open (`null`, "nav" or "details") lives in this context so headers can open
// them and the panels can close them.
export const NavDrawerContext = createContext({ panel: null, setPanel: () => {} });

export function useNavDrawer() {
  const { panel, setPanel } = useContext(NavDrawerContext);
  const open = useCallback((name) => setPanel(name), [setPanel]);
  const close = useCallback(() => setPanel(null), [setPanel]);
  return { panel, open, close };
}

/** Locks page scrolling behind an open drawer on narrow screens. */
export function useScrollLock(active) {
  useEffect(() => {
    if (!active || window.matchMedia("(min-width: 768px)").matches) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [active]);
}
