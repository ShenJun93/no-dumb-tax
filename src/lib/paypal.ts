export class PayPalError extends Error {
  constructor(
    public status: number,
    public body: string,
    message: string,
    public issue?: string,
  ) {
    super(message);
  }
}

export class PayPalClient {
  private token: { value: string; expires: number } | null = null;

  constructor(
    private cfg: { clientId: string; clientSecret: string; baseUrl: string },
    private fetchFn: typeof fetch = fetch,
  ) {}

  async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const auth = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const r = await this.fetchFn(`${this.cfg.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!r.ok) throw new PayPalError(r.status, await r.text(), "PayPal authentication failed");
    const j = (await r.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expires: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async request<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const r = await this.fetchFn(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) {
      let issue: string | undefined;
      try {
        issue = JSON.parse(text)?.details?.[0]?.issue;
      } catch {
        issue = undefined;
      }
      throw new PayPalError(r.status, text, `PayPal ${method} ${path} failed with ${r.status}`, issue);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }
}
