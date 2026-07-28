export function seoTextExcerpt(content: string, maxLength = 200) {
  const plainText = content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[\s>]*#{1,6}\s+/gm, "")
    .replace(/^[\s>]*[-*+]\s+/gm, "")
    .replace(/^[\s>]*\d+[.)]\s+/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  const hardCut = plainText.slice(0, maxLength).trimEnd();
  const lastSpace = hardCut.lastIndexOf(" ");
  const minUsefulLength = Math.floor(maxLength * 0.6);

  return (lastSpace >= minUsefulLength ? hardCut.slice(0, lastSpace) : hardCut).replace(/[,.，。:;；：-]+$/, "");
}
