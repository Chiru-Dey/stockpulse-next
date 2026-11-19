export type EmailAddress = { email: string; name?: string };

export type EmailMessage = {
  to: EmailAddress[];
  subject: string;
  html: string;
  text: string;
  tags?: string[];
};

export type SendResult = {
  skipped: boolean;
  recipients: number;
  messageId?: string;
};

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

/**
 * Sends via Brevo's transactional API. When unconfigured (or nobody to send
 * to) it logs and reports skipped instead of throwing, so stock operations
 * never fail because email is unavailable.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const recipients = message.to.length;
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    console.warn(
      "[email] BREVO_API_KEY / BREVO_SENDER_EMAIL not set — skipping send:",
      message.subject,
    );
    return { skipped: true, recipients };
  }
  if (recipients === 0) {
    console.warn("[email] no recipients — skipping send:", message.subject);
    return { skipped: true, recipients: 0 };
  }

  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: process.env.BREVO_SENDER_NAME || "StockPulse",
      },
      to: message.to,
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
      tags: message.tags,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Brevo send failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    messageId?: string;
  };
  return { skipped: false, recipients, messageId: payload.messageId };
}