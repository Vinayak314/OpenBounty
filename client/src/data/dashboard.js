// Copy and navigation shared by the dashboard and app shell.
export const currentUser = { name: "GitHub user", firstName: "GitHub user", handle: "GitHub account", initials: "GH" };
export const appNetwork = { label: "Whitechain Sepolia · USDT" };
export const navItems = [
  { id: "dashboard", label: "Dashboard", to: "/dashboard", icon: "dashboard" },
  { id: "profile", label: "Profile", to: "/profile", icon: "profile" },
];
export const sidebarNote = { title: "Good work grows here.", body: "Build in the open. Reward the people behind the progress." };
export const dashboardGreeting = {
  eyebrow: "YOUR CORNER OF OPEN SOURCE",
  headline: "Your OpenBounty projects",
  subline: "Add a repository from your connected GitHub account to get started.",
  action: { label: "Add from GitHub", icon: "github" },
};
export const dashboardStats = [
  { id: "usdc-earned", icon: "wallet", label: "USDC earned", value: "—", caption: "Across your contributions", href: "/profile" },
  { id: "bounties-completed", icon: "circle-check", label: "Bounties completed", value: "—", caption: "Work that made a difference", href: "/profile" },
  { id: "projects", icon: "sprout", label: "Your projects", value: "0", caption: "Repositories added to OpenBounty", href: "#projects" },
];
export const dashboardProjectsHeader = { title: "Your projects", repoPickerLabel: "Choose a repository" };
export const dashboardAddProject = { title: "+ Add Project", description: "Bring your GitHub repository to OpenBounty.", actionLabel: "Choose a repository →" };
export const dashboardNextReview = { prefix: "Ready to build with your community?", target: "Add a GitHub repository", actionLabel: "Choose repository →", href: "#projects" };
export const roleFilters = ["All roles", "Owner", "Maintainer", "Contributor"];
export const notifications = [];
