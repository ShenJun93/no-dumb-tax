import type { Llm } from "@/lib/llm";

export type Route = (url: string, init: RequestInit) => Response | Promise<Response>;

export function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** fetch replacement: first route whose key is contained in "METHOD url" answers. */
export function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const key = `${(init.method ?? "GET").toUpperCase()} ${url}`;
    const match = Object.keys(routes).find((k) => key.includes(k));
    if (!match) return json(404, { name: "NOT_FOUND", message: key });
    return routes[match](url, init);
  }) as typeof fetch;
  return { fn, calls };
}

export const tokenRoute: Record<string, Route> = {
  "POST https://pp.test/v1/oauth2/token": () => json(200, { access_token: "tok", expires_in: 3600 }),
};

export class FakeLlm implements Llm {
  calls: { system: string; user: string }[] = [];
  constructor(private answers: string[] | ((system: string, user: string) => string) | Error) {}
  async complete(system: string, user: string) {
    this.calls.push({ system, user });
    if (this.answers instanceof Error) throw this.answers;
    if (typeof this.answers === "function") return this.answers(system, user);
    return this.answers.shift() ?? "";
  }
}
