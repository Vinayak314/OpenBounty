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
  },
  {
    id: "bounties-completed",
    icon: "circle-check",
    label: "Bounties completed",
    value: "12",
    caption: "Work that made a difference",
  },
  {
    id: "projects",
    icon: "sprout",
    label: "Your projects",
    value: "3",
    caption: "Communities you’re growing",
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
