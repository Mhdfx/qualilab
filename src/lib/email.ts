import { prisma } from "./prisma";
import { COMPANY } from "./company";
import type { EmailType } from "@/generated/prisma/enums";

/**
 * Sending mail.
 *
 * Every send is written to `EmailLog` — the laboratory must be able to prove
 * what left, to whom and when, and to resend it.
 *
 * Until the client gives us DNS access on their domain (NEEDEDINFO item 2),
 * `RESEND_API_KEY` is absent and the message is recorded with the status
 * `SIMULE` instead of being handed to the provider. The whole chain —
 * recipients, subject, body, attachment, journal — therefore works and can be
 * demonstrated today; only the last hop is missing, and it becomes real by
 * setting two environment variables.
 */

export type Attachment = { filename: string; content: Buffer };

export type SendEmailInput = {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  type: EmailType;
  reportId?: string | null;
  attachments?: Attachment[];
};

export type SendResult = {
  status: "ENVOYE" | "SIMULE" | "ECHEC";
  providerId: string | null;
  error: string | null;
};

function sender() {
  return process.env.EMAIL_FROM ?? `${COMPANY.name} <onboarding@resend.dev>`;
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const recipients = input.to.filter(Boolean);
  if (recipients.length === 0) {
    return {
      status: "ECHEC",
      providerId: null,
      error: "Aucun destinataire.",
    };
  }

  const result = await deliver(input, recipients);

  // The journal is written whatever happened, including failures.
  await prisma.emailLog
    .create({
      data: {
        reportId: input.reportId ?? null,
        type: input.type,
        to: [...recipients, ...(input.cc ?? [])].join(", "),
        subject: input.subject,
        status: result.status,
        providerId: result.providerId,
        error: result.error,
      },
    })
    .catch((error) => {
      console.error("[email] could not record the send", { error });
    });

  return result;
}

async function deliver(
  input: SendEmailInput,
  recipients: string[]
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.info("[email] simulated (no RESEND_API_KEY)", {
      to: recipients,
      cc: input.cc,
      subject: input.subject,
      attachments: input.attachments?.map((a) => a.filename),
    });
    return { status: "SIMULE", providerId: null, error: null };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender(),
        to: recipients,
        cc: input.cc?.length ? input.cc : undefined,
        subject: input.subject,
        html: input.html,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content.toString("base64"),
        })),
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
    } | null;

    if (!response.ok) {
      return {
        status: "ECHEC",
        providerId: null,
        error: payload?.message ?? `HTTP ${response.status}`,
      };
    }

    return { status: "ENVOYE", providerId: payload?.id ?? null, error: null };
  } catch (error) {
    return {
      status: "ECHEC",
      providerId: null,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

/** The addresses a client should receive a given kind of mail on. */
export async function recipientsFor(
  clientId: string,
  kind: "reports" | "alerts"
): Promise<string[]> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      email: true,
      emails: {
        where: kind === "reports" ? { forReports: true } : { forAlerts: true },
        select: { email: true },
      },
    },
  });

  const listed = client?.emails.map((entry) => entry.email) ?? [];
  // Fall back to the single address on the client record if no list exists yet.
  if (listed.length === 0 && client?.email) return [client.email];

  return Array.from(new Set(listed));
}
