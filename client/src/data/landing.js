// Placeholder content for the Landing page. Replace with API data later.

export const BRAND_NAME = "OpenBounty";

export const NAV_LINKS = [
  { id: "how", label: "How it works", href: "#how-it-works" },
  { id: "maintainers", label: "For maintainers", href: "#for-maintainers" },
  { id: "community", label: "Community ↗", href: "#community" },
];

export const HERO = {
  eyebrow: "OPEN SOURCE. SHARED PURPOSE. VERIFIED REWARDS.",
  subtitle: "Contribute to open source. Get rewarded for impact.",
  note: "Your next contribution starts a conversation.",
  connectLabel: "Connect GitHub",
};

export const HOW_IT_WORKS_STEPS = [
  { id: "approve", number: "01", title: "Approve criteria", description: "Agree on what done looks like." },
  { id: "review", number: "02", title: "AI evidence review", description: "See the proof, not just a promise." },
  { id: "payout", number: "03", title: "USDC payout", description: "Reward work that makes an impact." },
];

export const SHARED_SPACE = {
  eyebrow: "A SHARED SPACE TO MOVE FORWARD",
  headingLine1: "Less scattered work.",
  headingPrefix: "More ",
  headingAccent: "common ground.",
  body: "Bring maintainers, contributors, and an AI teammate into one project conversation. Turn a good issue into a clear agreement, together.",
  ctaLabel: "Find your next contribution →",
  benefits: [
    { id: "chats", icon: "messagesSquare", label: "Project group chats" },
    { id: "threads", icon: "gitBranch", label: "Bounty threads" },
  ],
};

export const CONVERSATION_PREVIEW = {
  title: "The best work starts here.",
  status: "Live together",
  messages: [
    {
      id: "m1",
      initials: "RM",
      avatarColor: "#071b3e",
      author: "Rohan · Maintainer",
      text: "Let’s make keyboard navigation work for everyone. I’ve added the acceptance criteria to #42.",
    },
    {
      id: "m2",
      initials: "AS",
      avatarColor: "#da7038",
      author: "Ananya · Contributor",
      text: "I’m in. A focused fix, a clear finish line.",
    },
  ],
  agreement: {
    issue: "#42 · Keyboard navigation",
    meta: "3 criteria · 1 shared agreement",
    reward: "250 USDC",
  },
};

export const PRINCIPLES_SECTION = {
  eyebrow: "CLARITY IS A KINDNESS",
  headingPrefix: "Every contribution. A clear ",
  headingAccent: "path to reward.",
};

export const PRINCIPLES = [
  {
    id: "agree",
    icon: "listChecks",
    number: "01",
    title: "Agree before you build.",
    description:
      "Write specific acceptance criteria with your maintainer. No moving goalposts. Just a shared definition of done.",
    tag: "Clear acceptance criteria",
  },
  {
    id: "proof",
    icon: "scanEye",
    number: "02",
    title: "Proof you can inspect.",
    description:
      "AI maps pull requests and tests to each criterion. Review the sources, see what’s missing, and decide with confidence.",
    tag: "AI advises, maintainer approves",
  },
  {
    id: "reward",
    icon: "wallet",
    number: "03",
    title: "Impact, rewarded.",
    description:
      "Once the maintainer approves, contributors receive USDC in their wallet. A transparent record of work well done.",
    tag: "USDC rewards on Base",
  },
];

export const COMMUNITY_STORY = {
  eyebrow: "BUILT IN THE OPEN. GROWN TOGETHER.",
  title: "There’s a person behind every pull request.",
  body: "A first contribution. A late-night bug fix. A more accessible web. OpenBounty helps communities recognize the people who make open source better.",
  values: ["Shared ownership", "Visible impact", "Fair recognition"],
};

export const FINAL_INVITATION = {
  headingPrefix: "Make something ",
  headingAccent: "that matters.",
  subtitle: "Find your people. Ship the work. Share in the reward.",
};

export const FOOTER = {
  copyright: "© 2026 OpenBounty · Built for the commons.",
  links: [
    { id: "github", label: "GitHub ↗", href: "#" },
    { id: "privacy", label: "Privacy", href: "#" },
    { id: "terms", label: "Terms", href: "#" },
  ],
};
