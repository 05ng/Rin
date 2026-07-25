export function normalizeWebsiteUrl(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  try {
    const url = new URL(trimmedValue);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname || url.username || url.password) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
