import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders AI output. Raw HTML is not enabled (react-markdown escapes it) and images are shown as links
// so model or repository text cannot load remote tracking pixels.
const components = {
  p: (props) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
  h1: (props) => <h3 className="mb-1 mt-3 text-[14px] font-semibold first:mt-0" {...props} />,
  h2: (props) => <h3 className="mb-1 mt-3 text-[13px] font-semibold first:mt-0" {...props} />,
  h3: (props) => <h4 className="mb-1 mt-3 text-[12px] font-semibold first:mt-0" {...props} />,
  h4: (props) => <h4 className="mb-1 mt-2 text-[12px] font-semibold first:mt-0" {...props} />,
  ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
  ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
  li: (props) => <li className="pl-0.5" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  blockquote: (props) => <blockquote className="my-2 border-l-2 border-sky-300 pl-3 text-ob-slate" {...props} />,
  hr: () => <hr className="my-3 border-ob-line" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-sky-700 underline underline-offset-2 hover:text-sky-900">{children}</a>
  ),
  img: ({ src, alt }) => (
    <a href={src} target="_blank" rel="noopener noreferrer nofollow" className="text-sky-700 underline">{alt || "image"}</a>
  ),
  pre: (props) => <pre className="my-2 overflow-x-auto rounded-[10px] bg-ob-navy px-3 py-2.5 text-[11px] leading-[18px] text-white [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-white" {...props} />,
  code: ({ className, children, ...rest }) => (
    className
      ? <code className={`${className} font-mono`} {...rest}>{children}</code>
      : <code className="rounded bg-ob-mist px-1 py-px font-mono text-[11px]" {...rest}>{children}</code>
  ),
  table: (props) => <div className="my-2 overflow-x-auto"><table className="w-full border-collapse text-[11px]" {...props} /></div>,
  th: (props) => <th className="border border-ob-line bg-ob-mist px-2 py-1 text-left font-semibold" {...props} />,
  td: (props) => <td className="border border-ob-line px-2 py-1 align-top" {...props} />,
};

export default function Markdown({ text }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
      {text}
    </ReactMarkdown>
  );
}
