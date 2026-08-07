import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  base16AteliersulphurpoolLight,
  vscDarkPlus,
} from "react-syntax-highlighter/dist/esm/styles/prism";

export function MarkdownCodeBlock({
  code,
  colorMode,
  language,
}: {
  code: string;
  colorMode: string;
  language: string;
}) {
  const [copied, setCopied] = useState(false);
  const codeBlockStyle = {
    fontFamily: 'ui-monospace, "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
    fontSize: "14px",
    fontVariantLigatures: "normal",
    WebkitFontFeatureSettings: '"liga" 1',
    fontFeatureSettings: '"liga" 1',
  };

  return (
    <div className="relative group">
      <SyntaxHighlighter
        PreTag="div"
        className="rounded"
        language={language}
        style={colorMode === "dark" ? vscDarkPlus : base16AteliersulphurpoolLight}
        wrapLongLines={true}
        codeTagProps={{ style: codeBlockStyle }}
      >
        {code}
      </SyntaxHighlighter>
      <button
        className="absolute top-1 right-1 px-2 py-1 bg-w rounded-md text-sm bg-hover select-none invisible group-hover:visible"
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
