import { AVATAR_COLORS } from "@/data/project";

export default function Avatar({ initials, color = "navy", size = 32, dot = false, children }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: AVATAR_COLORS[color] }}
    >
      {children ?? initials}
      {dot && (
        <span className="absolute -bottom-px -right-px size-[9px] rounded-full border-[1.5px] border-[#f8fafc] bg-[#38bdf8]" />
      )}
    </span>
  );
}
