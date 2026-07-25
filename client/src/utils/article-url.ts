export function articlePath(id: number | string, alias?: string | null): string {
  return alias ? `/${encodeURIComponent(alias)}` : `/feed/${id}`;
}
