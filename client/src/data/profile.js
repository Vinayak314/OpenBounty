export const profile = {
  name: "GitHub user",
  handle: "GitHub account",
  bio: "No public GitHub bio set.",
  avatarUrl: "",
  githubConnected: true,
  githubBadgeLabel: "GitHub connected ✓",
  wallet: {
    label: "PAYOUT WALLET · BASE",
    address: "Not connected",
    provider: "Connect a wallet to receive payouts",
  },
};

export const profileStats = [
  { id: "bounties", label: "Bounties completed", value: "12", caption: "Across 3 communities" },
  { id: "earned", label: "USDT earned", value: "1,840", caption: "Lifetime payouts" },
  { id: "projects", label: "Projects", value: "3", caption: "Open-source communities" },
  { id: "reviews", label: "Reviews passed", value: "14", caption: "Reviewed by maintainers" },
];

/**
 * GitHub-style contribution calendar. Each week holds 7 day levels
 * (Mon-first rows) where 0 = none ... 3 = most active.
 */
export const contributionActivity = {
  title: "A year of showing up.",
  summary: "366 GitHub contributions in the last year",
  rangeLabel: "Nov 2025 – Nov 2026",
  months: ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
  weekdayLabels: ["Mon", "Wed", "Fri"],
  legend: { less: "Less", more: "More" },
  weeks: [
    [0, 1, 0, 2, 0, 3, 1],
    [0, 3, 1, 0, 2, 0, 2],
    [2, 0, 3, 1, 0, 1, 0],
    [0, 2, 0, 2, 1, 0, 1],
    [1, 0, 1, 0, 2, 0, 3],
    [2, 1, 0, 1, 0, 2, 0],
    [0, 2, 0, 3, 1, 0, 2],
    [1, 0, 2, 0, 3, 1, 0],
    [3, 1, 0, 2, 0, 2, 1],
    [0, 3, 1, 0, 1, 0, 2],
    [2, 0, 2, 1, 0, 1, 0],
    [0, 1, 0, 2, 0, 3, 1],
    [1, 0, 1, 0, 2, 0, 3],
    [2, 0, 3, 1, 0, 2, 0],
    [0, 2, 0, 3, 1, 0, 1],
    [1, 0, 2, 0, 2, 1, 0],
    [3, 1, 0, 1, 0, 2, 0],
    [0, 2, 1, 0, 1, 0, 2],
    [1, 0, 2, 0, 3, 1, 0],
    [0, 1, 0, 2, 0, 3, 1],
    [0, 3, 1, 0, 2, 0, 2],
    [2, 0, 3, 1, 0, 1, 0],
    [0, 2, 0, 2, 1, 0, 1],
    [1, 0, 1, 0, 2, 0, 3],
    [2, 1, 0, 1, 0, 2, 0],
    [0, 2, 0, 3, 1, 0, 2],
    [1, 0, 2, 0, 3, 1, 0],
    [3, 1, 0, 2, 0, 2, 1],
    [0, 3, 1, 0, 1, 0, 2],
    [2, 0, 2, 1, 0, 1, 0],
    [0, 1, 0, 2, 0, 3, 1],
    [1, 0, 1, 0, 2, 0, 3],
    [2, 0, 3, 1, 0, 2, 0],
    [0, 2, 0, 3, 1, 0, 1],
    [1, 0, 2, 0, 2, 1, 0],
    [3, 1, 0, 1, 0, 2, 0],
    [0, 2, 1, 0, 1, 0, 2],
    [1, 0, 2, 0, 3, 1, 0],
    [0, 1, 0, 2, 0, 3, 1],
    [0, 3, 1, 0, 2, 0, 2],
    [2, 0, 3, 1, 0, 1, 0],
    [0, 2, 0, 2, 1, 0, 1],
    [1, 0, 1, 0, 2, 0, 3],
    [2, 1, 0, 1, 0, 2, 0],
    [0, 2, 0, 3, 1, 0, 2],
    [1, 0, 2, 0, 3, 1, 0],
    [3, 1, 0, 2, 0, 2, 1],
    [0, 3, 1, 0, 1, 0, 2],
    [2, 0, 2, 1, 0, 1, 0],
    [0, 1, 0, 2, 0, 3, 1],
    [1, 0, 1, 0, 2, 0, 3],
    [2, 0, 3, 1, 0, 2, 0],
  ],
};

export const recentBounties = {
  title: "Recent bounties",
  statusLabel: "Completed",
  items: [
    { id: "35", title: "#35 · Fix tooltip contrast", meta: "Canopy UI · Nov 3", amount: "180 USDT", status: "Paid" },
    { id: "28", title: "#28 · Retry middleware", meta: "River SDK · Oct 29", amount: "220 USDT", status: "Paid" },
    { id: "19", title: "#19 · Contributor quickstart", meta: "Docs Garden · Oct 24", amount: "100 USDT", status: "Paid" },
  ],
};

export const projectEarnings = {
  title: "Where you've grown",
  items: [
    { id: "canopy-ui", name: "Canopy UI", meta: "7 bounties", amount: "1,140" },
    { id: "river-sdk", name: "River SDK", meta: "3 bounties", amount: "460" },
    { id: "docs-garden", name: "Docs Garden", meta: "2 bounties", amount: "240" },
  ],
};

export const profileFootnote = "Public profile details are loaded from GitHub. OpenBounty payout history is not connected yet.";
