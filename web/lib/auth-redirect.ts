import { isUnauthenticated, signInUrl } from "@/lib/api";
import { currentPath, navigateTo } from "@/lib/navigation";

export function redirectIfUnauthenticated(error: unknown): boolean {
  if (!isUnauthenticated(error)) {
    return false;
  }
  navigateTo(signInUrl(currentPath()));
  return true;
}
