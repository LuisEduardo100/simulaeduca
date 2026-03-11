"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StemRendererProps {
  stem: string;
  className?: string;
}

/**
 * Renders a question stem with markdown support (tables, bold, etc.).
 * Falls back to plain text rendering for stems without markdown.
 */
export function StemRenderer({ stem, className }: StemRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Tables with proper styling
          table: ({ children }) => (
            <table className="border-collapse border border-border my-2 text-sm w-full">
              {children}
            </table>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-border px-3 py-1.5 text-left font-semibold text-xs">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-1.5 text-xs">
              {children}
            </td>
          ),
          // Keep paragraphs inline-friendly
          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
        }}
      >
        {stem}
      </ReactMarkdown>
    </div>
  );
}
