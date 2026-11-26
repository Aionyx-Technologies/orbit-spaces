export type RecordedCall = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  json: unknown;
  formData: FormData | null;
};

export type RouteHandler = (call: RecordedCall) => Response | Promise<Response>;

export type Routes = Record<string, RouteHandler | Response>;

export type FetchMock = {
  calls: RecordedCall[];
  callsTo: (method: string, url: string) => RecordedCall[];
};
