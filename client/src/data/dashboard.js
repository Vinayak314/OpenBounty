// Static placeholder data for the Dashboard screen (and the shared app shell).
// Shaped like future API responses so a backend can replace these constants
// without touching the components. No fetching happens anywhere in the UI.

/** Signed-in user, shared by the app sidebar and header. */
export const currentUser = {
  name: "Ananya Shah",
  firstName: "Ananya",
  handle: "@ananyacodes",
  initials: "AS",
};

/** Network / currency chip shown in the app header. */
export const appNetwork = { label: "Base · USDC" };

/** Left sidebar navigation. `icon` is a key resolved inside AppSidebar. */
export const navItems = [
  { id: "dashboard", label: "Dashboard", to: "/dashboard", icon: "dashboard" },
  { id: "profile", label: "Profile", to: "/profile", icon: "profile" },
];

/** Small community card shown in the roomy sidebar variant. */
export const sidebarNote = {
  title: "Good work grows here.",
  body: "Build in the open. Reward the people behind the progress.",
};

export const dashboardGreeting = {
  eyebrow: "YOUR CORNER OF OPEN SOURCE",
  headline: "Good to see you, Ananya.",
  subline: "A little progress, a shared purpose. Here’s where you left off.",
  action: { label: "Add from GitHub", icon: "github" },
};

export const dashboardStats = [
  {
    id: "usdc-earned",
    icon: "wallet",
    label: "USDC earned",
    value: "1,840",
    caption: "Across your contributions",
    href: "/profile",
  },
  {
    id: "bounties-completed",
    icon: "circle-check",
    label: "Bounties completed",
    value: "12",
    caption: "Work that made a difference",
    href: "/profile",
  },
  {
    id: "projects",
    icon: "sprout",
    label: "Your projects",
    value: "3",
    caption: "Communities you’re growing",
    href: "#projects",
  },
];

export const dashboardProjectsHeader = {
  title: "Your projects",
  count: 3,
  filterLabel: "All roles",
  repoPickerLabel: "Choose a repository",
};

/** `tone` picks the avatar colour: "navy" | "orange". */
export const dashboardProjects = [
  {
    id: "canopy-ui",
    name: "Canopy UI",
    repo: "canopy-labs / canopy-ui",
    description: "Accessible components for a more welcoming web.",
    role: "Maintainer",
    icon: "sprout",
    openBounties: 1,
    updatedLabel: "Updated today",
    memberCount: 8,
    members: [
      { initials: "RM", tone: "navy" },
      { initials: "AS", tone: "orange" },
      { initials: "PK", tone: "navy" },
    ],
    workspaceHref: "/project",
  },
  {
    id: "docs-garden",
    name: "Docs Garden",
    repo: "docs-garden / handbook",
    description: "Open documentation that helps good ideas take root.",
    role: "Owner",
    icon: "book-open",
    openBounties: 2,
    updatedLabel: "Updated today",
    memberCount: 5,
    members: [
      { initials: "RM", tone: "navy" },
      { initials: "AS", tone: "orange" },
      { initials: "PK", tone: "navy" },
    ],
    workspaceHref: "/project",
  },
  {
    id: "river-sdk",
    name: "River SDK",
    repo: "river-dev / river-sdk",
    description: "A friendlier toolkit for building on open infrastructure.",
    role: "Contributor",
    icon: "waves",
    openBounties: 3,
    updatedLabel: "Updated today",
    memberCount: 12,
    members: [
      { initials: "RM", tone: "navy" },
      { initials: "AS", tone: "orange" },
      { initials: "PK", tone: "navy" },
    ],
    workspaceHref: "/project",
  },
];

export const dashboardAddProject = {
  title: "+ Add Project",
  description: "Bring your GitHub repository and your people.",
  actionLabel: "Choose a repository →",
};

export const dashboardNextReview = {
  prefix: "Your next review is ready:",
  target: "Canopy UI · #42 Keyboard navigation",
  actionLabel: "View report →",
  href: "/project",
};

export const roleFilters = ["All roles", "Owner", "Maintainer", "Contributor"];

/** Sample repositories offered by the "Add from GitHub" picker (no live GitHub call). */
export const availableRepos = [
  { id: "open-forms", name: "Open Forms", repo: "acme / open-forms", description: "Accessible form building blocks for any stack.", icon: "book-open" },
  { id: "river-cli", name: "River CLI", repo: "river-dev / river-cli", description: "Command-line companion to River SDK.", icon: "waves" },
  { id: "canopy-docs", name: "Canopy Docs", repo: "canopy-labs / canopy-docs", description: "Guides and recipes for Canopy UI.", icon: "sprout" },
  { id: "garden-tools", name: "Garden Tools", repo: "docs-garden / tools", description: "Linting and publishing tools for handbooks.", icon: "book-open" },
];

export const notifications = [
  { id: "n1", title: "Review ready", body: "Canopy UI · #42 Keyboard navigation", to: "/project", time: "2m" },
  { id: "n2", title: "Payout approved", body: "Docs Garden · 120 USDC", to: "/profile", time: "1h" },
  { id: "n3", title: "New bounty", body: "River SDK · Add retry helpers", to: "/project", time: "3h" },
];
