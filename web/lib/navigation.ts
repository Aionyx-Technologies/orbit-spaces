export function navigateTo(url: string, target: Pick<Location, "assign"> = window.location): void {
  target.assign(url);
}

export function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}
