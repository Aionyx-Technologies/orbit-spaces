import { useEffect, useState } from "react";

import { CLOCK_TICK_MS } from "@/lib/constants";

export function useNow(intervalMs: number = CLOCK_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
