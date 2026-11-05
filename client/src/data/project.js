// Placeholder data for the Project workspace. Shaped like future API responses
// (project, members, channel messages, leaderboard, bounty tasks) so a backend can replace it.

export const AVATAR_COLORS = {
  navy: "#071b3e",
  orange: "#da7038",
  pink: "#a44370",
};

export const PROJECT = {
  id: "canopy-ui",
  name: "Canopy UI",
  repo: "canopy-labs / canopy-ui",
  repoUrl: "#",
  dashboardHref: "/dashboard",
  memberCount: 8,
  footnote: "Illustrative workspace · No live payments.",
};

export const CHANNELS = [
  { id: "general", name: "general", unread: 3, active: true },
];



export const BOUNTY_THREADS = [
  { id: "42", title: "#42 · Keyboard navigation", subtitle: "3 new replies · PR #87", active: true },
  { id: "47", title: "#47 · Modal focus trap", subtitle: "View conversation" },
  { id: "38", title: "#38 · Empty states", subtitle: "View conversation" },
  { id: "35", title: "#35 · Tooltip contrast", subtitle: "View conversation" },
];

export const CHANNEL = {
  id: "general",
  name: "general",
  project: "Canopy UI",
  pinned: { text: "Pinned: #42 · 250 USDC · 3 criteria", action: "View" },
  dateLabel: "Today · Nov 5",
  composerPlaceholder: "Message #general or ask @Bounty agent...",
  composerHint: "Markdown",
  visibility: "Visible to Canopy UI members.",
};

export const EVIDENCE_REPORT = {
  title: "Evidence report",
  status: "Review required",
  subtitle: "#42 Keyboard navigation · PR #87 · commit 8f3a2c1",
  columns: ["Criterion", "Assessment", "Evidence"],
  rows: [
    {
      id: "c1",
      criterion: "Arrow keys navigate menu items",
      assessment: { label: "Supported", tone: "neutral" },
      evidence: ["PR #87 · menu.tsx L48–92", "12 keyboard tests pass."],
    },
    {
      id: "c2",
      criterion: "Document keyboard shortcuts",
      assessment: { label: "Missing", tone: "warning" },
      evidence: ["No update found in", "docs/menu.mdx."],
    },
    {
      id: "c3",
      criterion: "Screen reader announces focus",
      assessment: { label: "Needs verification", tone: "neutral" },
      evidence: ["ARIA labels added in L76.", "Manual NVDA check needed."],
    },
  ],
  next: "Next: add shortcut guide and screen-reader recording.",
  policy: "AI advises, maintainer approves",
  requestId: "0G request ID: 0g-ev-42-8f3a2c1",
};

export const MESSAGES = [
  {
    id: "m1",
    type: "message",
    author: { name: "Rohan Mehta", initials: "RM", color: "navy" },
    time: "10:02",
    variant: "filled",
    body: "The #42 agreement is ready. Arrow-key navigation, a shortcut guide, and screen-reader focus announcements. Ananya, thanks for picking this up!",
  },
  {
    id: "m2",
    type: "message",
    author: { name: "Ananya Shah", initials: "AS", color: "orange" },
    time: "10:08",
    variant: "outlined",
    body: "PR #87 is up. Keyboard tests are passing. I’ll add the docs and a screen-reader recording next. @Bounty agent, could you review the evidence?",
  },
  { id: "e1", type: "event", title: "PR opened for #42", meta: "10:08 · Bounty agent" },
  {
    id: "m3",
    type: "report",
    author: { name: "Bounty agent", agent: true },
    time: "10:09",
    report: EVIDENCE_REPORT,
  },
  {
    id: "m4",
    type: "message",
    author: { name: "Priya Kumar", initials: "PK", color: "navy" },
    time: "10:14",
    variant: "filled",
    body: "Thanks! I’ll verify the NVDA recording when it’s ready. Separately, #38 is approved: all empty-state criteria passed. The 120 USDC payout is ready for a maintainer.",
  },
];

export const LEADERBOARD = {
  title: "Leaderboard",
  subtitle: "Canopy UI · All-time USDC",
  entries: [
    { rank: 1, name: "Maya Iyer", initials: "MI", color: "pink", amount: "1,460" },
    { rank: 2, name: "Ananya Shah", initials: "AS", color: "orange", amount: "1,140" },
    { rank: 3, name: "Kavya Rao", initials: "KR", color: "navy", amount: "860" },
  ],
};

// action.kind: "primary" = navy button, "disabled" = muted label
export const TASKS = {
  title: "Tasks",
  createLabel: "Create bounty",
  footnote: "Illustrative USDC values. Approvals require maintainer review and wallet confirmation.",
  items: [
    { id: "51", status: "Open", title: "Add dark-mode tokens", detail: "Available to claim", amount: 150, action: { label: "Claim", kind: "primary" } },
    { id: "47", status: "Claimed", title: "Fix modal focus trap", detail: "Maya Iyer · @maya-builds", amount: 200, action: { label: "Claimed by Maya", kind: "disabled" } },
    { id: "42", status: "PR Submitted", title: "Keyboard navigation", detail: "Ananya Shah · PR #87", amount: 250, action: { label: "Claim unavailable", kind: "disabled" } },
    { id: "38", status: "Approved", title: "Improve empty states", detail: "Kavya Rao · Ready for payout", amount: 120, action: { label: "Approve & pay", kind: "primary" } },
    { id: "35", status: "Paid", title: "Fix tooltip contrast", detail: "Ananya Shah · Paid Nov 3", amount: 180, action: { label: "Payout complete", kind: "disabled" } },
  ],
};
