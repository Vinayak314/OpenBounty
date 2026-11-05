// Placeholder data for the Connect wallet screen. Shaped like a future API response
// (onboarding session + supported wallet providers) so a backend can replace it later.

export const WALLET_SESSION = {
  steps: [
    { id: "github", label: "GitHub connected", status: "complete" },
    { id: "wallet", index: "02", label: "Connect wallet", status: "current" },
    { id: "dashboard", index: "03", label: "Your dashboard", status: "upcoming" },
  ],
  account: {
    handle: "@ananyacodes",
    initials: "AS",
    provider: "GitHub",
    status: "connected",
  },
  intro: {
    headline: "A home for your",
    headlineMuted: "hard-earned rewards.",
    description:
      "Connect your wallet to receive USDC payouts for approved open-source contributions.",
  },
  trustNote:
    "You stay in control. We’ll never ask for your seed phrase or move funds without your approval. Connecting is free.",
  nextStep: { label: "Next up: your project dashboard →", href: "/dashboard" },
  network: "USDC on Base · No transaction is made during setup.",
  helpLink: { label: "Need a hand? Visit our help center ↗", href: "#" },
  footer: "A little clarity. A lot of possibility.  ·  OpenBounty",
};

