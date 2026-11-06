// Placeholder data for the Connect wallet screen. Shaped like a future API response
// (onboarding session + supported wallet providers) so a backend can replace it later.

export const WALLET_SESSION = {
  steps: [
    { id: "github", label: "GitHub connected", status: "complete" },
    { id: "wallet", index: "02", label: "Payment account", status: "current" },
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
      "Create a passkey payment account to fund bounties or receive USDT rewards. No seed phrase, no wallet app, no gas token.",
  },
  trustNote:
    "Your passkey stays on your device. Every payment needs your fingerprint, face or device PIN, and OpenBounty pays the network fees. We can never move funds without your approval.",
  nextStep: { label: "Next up: your project dashboard →", href: "/dashboard" },
  network: "USDT on Whitechain Sepolia (test network) · Network fees are sponsored by OpenBounty.",
  helpLink: { label: "Need a hand? Visit our help center ↗", href: "#" },
  footer: "A little clarity. A lot of possibility.  ·  OpenBounty",
};

