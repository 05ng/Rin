export function articlePath(id: number | string, alias?: string | null, language?: string): string {
  const path = alias ? `/${encodeURIComponent(alias)}` : `/feed/${id}`;
  return language && language !== "en" ? `/${language}${path}` : path;
}
