import { EngineError, type Logger } from "./context";

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always present: it is the fallback for every client. */
  text: string;
  html?: string;
  /** Stops the same logical email being sent twice if a caller retries (Resend keeps keys for 24 hours). */
  idempotencyKey?: string;
  /** Free-form labels for the provider's dashboard (letters, digits, underscore, dash). */
  tags?: Record<string, string>;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<{ id: string | null }>;
  /** Whether mail can really leave this deployment. Features that depend on email check it first. */
  readonly available: boolean;
}

/** Resend (https://resend.com/docs/api-reference/emails/send-email): POST /emails with a bearer API key. */
export class ResendEmailSender implements EmailSender {
  readonly available = true;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly log: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = "https://api.resend.com",
  ) {}

  async send(msg: EmailMessage): Promise<{ id: string | null }> {
    const res = await this.fetchImpl(`${this.baseUrl}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(msg.idempotencyKey ? { "idempotency-key": msg.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
        ...(msg.tags ? { tags: Object.entries(msg.tags).map(([name, value]) => ({ name, value })) } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch((err) => {
      this.log.error("email provider unreachable", { err: String(err).slice(0, 200) });
      throw new EngineError("EMAIL_FAILED", "The email could not be sent right now. Try again in a minute.", 502);
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      // Never log the message body: it can contain a one-time link.
      this.log.error("email provider rejected a message", { status: res.status, name: body.name, message: body.message?.slice(0, 200), subject: msg.subject });
      throw new EngineError("EMAIL_FAILED", "The email could not be sent right now. Try again in a minute.", 502);
    }
    return { id: body.id ?? null };
  }
}

/** Development: writes the email to the log instead of sending it. Contains links, so never use it in production. */
export class ConsoleEmailSender implements EmailSender {
  readonly available = true;
  constructor(private readonly log: Logger) {}
  async send(msg: EmailMessage) {
    this.log.info("email (console sender, not delivered)", { to: msg.to, subject: msg.subject, text: msg.text });
    return { id: null };
  }
}

/** Tests: keeps every message so a test can read the link a real user would click. */
export class MemoryEmailSender implements EmailSender {
  readonly available = true;
  readonly sent: EmailMessage[] = [];
  failNext = false;
  async send(msg: EmailMessage) {
    if (this.failNext) {
      this.failNext = false;
      throw new EngineError("EMAIL_FAILED", "The email could not be sent right now. Try again in a minute.", 502);
    }
    this.sent.push(msg);
    return { id: `mem_${this.sent.length}` };
  }
  to(address: string) {
    return this.sent.filter((m) => m.to.toLowerCase() === address.toLowerCase());
  }
  last(address: string) {
    return this.to(address).at(-1);
  }
  /** The first https/http link in the most recent message to an address. */
  linkTo(address: string): string | undefined {
    return this.last(address)?.text.match(/https?:\/\/\S+/)?.[0];
  }
}

/** Production without Resend configured: features that need email say so instead of pretending to work. */
export class UnavailableEmailSender implements EmailSender {
  readonly available = false;
  async send(): Promise<{ id: string | null }> {
    throw new EngineError("EMAIL_UNAVAILABLE", "Email is not configured on this server (set RESEND_API_KEY and EMAIL_FROM).", 503);
  }
}

export function createEmailSender(env: Record<string, string | undefined>, log: Logger): EmailSender {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (key && from) return new ResendEmailSender(key, from, log);
  if (env.NODE_ENV === "production") return new UnavailableEmailSender();
  return new ConsoleEmailSender(log);
}
