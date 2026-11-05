import { cn } from "@/lib/utils";

const TONES = {
  orange: "bg-[#da7038]",
  navy: "bg-ob-navy",
};

/**
 * Round avatar with initials.
 * Props: initials, tone ("orange" | "navy"), className (size + text size).
 */
export default function InitialsAvatar({ initials, photoURL, tone = "orange", className }) {
  if (photoURL) {
    return <img src={photoURL} alt="" className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white",
        TONES[tone] ?? TONES.orange,
        className,
      )}
    >
      {initials}
    </span>
  );
}
