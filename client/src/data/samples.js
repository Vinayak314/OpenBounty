// Placeholder data for the Static interaction samples screen.

export const SAMPLES = {
  title: "A little delight, thoughtfully placed.",
  subtitle:
    "STATIC STATE STUDIES · Hover, scroll reveal, and payout celebration. No live interactions or payment.",
  buttonStates: {
    title: "Button / hover states",
    states: [
      { id: "default", label: "Default", text: "Claim bounty" },
      { id: "hover", label: "Hover", text: "Claim bounty", forceHover: true },
      { id: "unavailable", label: "Unavailable", text: "Already claimed", disabled: true },
    ],
  },
  scrollReveal: {
    title: "Scroll reveal / static keyframes",
    text: "Good work grows here.",
    before: "Before reveal",
    after: "After reveal",
  },
  payoutSuccess: {
    heading: "Impact, rewarded.",
    amount: "120 USDT",
    lines: ["#38 · Improve empty states", "Sent to Kavya’s connected wallet."],
    caption: "Payout success · Illustrative end state",
  },
};
