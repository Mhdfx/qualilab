/**
 * Who the laboratory's e-mails come from (RETOUR-LABO-28-10.md L4 — partie 5 :
 * « Nous n'utilisons pas d'adresse no-reply ! »). Pure, shared by
 * /admin/entreprise, its route and the send (`email.ts`).
 *
 * The sender is a real mailbox of the laboratory, which the client may
 * answer: the address set in /admin/entreprise (« Envoi des e-mails »), else
 * the `EMAIL_FROM` configuration, else the identity's own e-mail. The name
 * shown beside it is the one set there, else the laboratory's name. The
 * replies go to the « Adresse de réponse » when set, else to the identity's
 * e-mail when it differs from the sender. A « no-reply » address is refused
 * on the screen, and never used as the fallback any more.
 *
 * The provider (Resend) only sends from a domain whose DNS records it
 * verified (NEEDEDINFO item 2, R-20): until then every send stays SIMULE.
 */

export type SenderSettings = {
  emailSenderAddress: string | null;
  emailSenderName: string | null;
  emailReplyTo: string | null;
};

export const EMPTY_SENDER_SETTINGS: SenderSettings = { emailSenderAddress: null, emailSenderName: null, emailReplyTo: null };

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
/** « no-reply », « noreply », « ne-pas-repondre »… in the local part. */
const NO_REPLY = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|ne[-_.]?pas[-_.]?r[ée]pondre|nepasrepondre)/i;

export function isNoReply(address: string): boolean {
  return NO_REPLY.test(address.trim().split("@")[0] ?? "");
}

/** « Nom <adresse> » → the address alone; a bare address as is. */
export function addressOf(value: string): string {
  const match = /<([^>]+)>\s*$/.exec(value.trim());
  return (match ? match[1] : value).trim();
}

/** A display name as an RFC 5322 header carries it: quoted when it holds a special character. */
function displayName(name: string): string {
  const clean = name.replace(/["\\\r\n]/g, "").trim();
  return /[(),.:;<>@[\]]/.test(clean) ? `"${clean}"` : clean;
}

export type SenderHeaders = { from: string; replyTo: string | null };

/** The From and Reply-To of every message. */
export function senderHeaders(input: {
  settings: SenderSettings;
  envFrom: string | null | undefined;
  company: { name: string; email: string };
}): SenderHeaders {
  const { settings, company } = input;
  const companyEmail = company.email.trim();
  const configured = settings.emailSenderAddress?.trim();
  const env = input.envFrom?.trim();
  let from: string;
  if (configured) {
    from = `${displayName(settings.emailSenderName?.trim() || company.name)} <${configured}>`;
  } else if (env) {
    from = env;
  } else {
    from = `${displayName(settings.emailSenderName?.trim() || company.name)} <${companyEmail}>`;
  }
  const fromAddress = addressOf(from).toLowerCase();
  const reply = settings.emailReplyTo?.trim() || companyEmail;
  return { from, replyTo: reply && reply.toLowerCase() !== fromAddress ? reply : null };
}

export type SenderSettingsRead = { ok: true; value: SenderSettings } | { ok: false; error: string };

/**
 * The three fields as /admin/entreprise sends them: each optional and
 * cleared when blank; an address must be one, and never a « no-reply ».
 */
export function parseSenderSettings(body: unknown): SenderSettingsRead {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Requête invalide." };
  const input = body as Record<string, unknown>;
  const read = (key: keyof SenderSettings) => (typeof input[key] === "string" ? (input[key] as string).trim() : input[key] == null ? "" : null);
  const sender = read("emailSenderAddress");
  const name = read("emailSenderName");
  const reply = read("emailReplyTo");
  if (sender === null || name === null || reply === null) return { ok: false, error: "Requête invalide." };
  for (const [value, label] of [
    [sender, "L'adresse d'expédition"],
    [reply, "L'adresse de réponse"],
  ] as const) {
    if (!value) continue;
    if (value.length > 191 || !EMAIL.test(value)) return { ok: false, error: `${label} n'est pas une adresse e-mail valide.` };
    if (isNoReply(value)) return { ok: false, error: `${label} doit être une vraie boîte du laboratoire, pas une adresse « no-reply ».` };
  }
  if (name.length > 120) return { ok: false, error: "Le nom affiché est trop long (120 caractères maximum)." };
  return { ok: true, value: { emailSenderAddress: sender || null, emailSenderName: name || null, emailReplyTo: reply || null } };
}
