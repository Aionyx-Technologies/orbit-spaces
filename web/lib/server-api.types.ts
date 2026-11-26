export type ServerResult<T> =
  { ok: true; data: T } | { ok: false; status: number; code: string; message: string };
