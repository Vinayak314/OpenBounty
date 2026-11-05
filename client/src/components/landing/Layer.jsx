// Absolutely-positioned illustration layer, using Figma's percentage insets.
// `inset` = "top right bottom left" of the layer box; `pad` = optional negative
// inset applied to the image inside (stroke overflow), same CSS shorthand.
export default function Layer({ src, inset, pad, flip = false, className = "" }) {
  return (
    <div
      className={`absolute ${className}`}
      style={{ inset, transform: flip ? "scaleX(-1)" : undefined }}
    >
      <div className="absolute" style={{ inset: pad || 0 }}>
        <img alt="" draggable={false} src={src} className="block max-w-none size-full" />
      </div>
    </div>
  );
}
