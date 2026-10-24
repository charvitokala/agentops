import type { ExtractedMessage } from "../shared/contracts.ts";
import { hasRequest, normalizeText } from "../detection/rules.ts";

type MessageContent = Pick<ExtractedMessage, "text" | "email">;

function content(message: MessageContent): string {
  const prefix = message.email ? `Subject: ${message.email.subject}\n\n` : "";
  return (
    prefix && message.text.startsWith(prefix)
      ? message.text.slice(prefix.length) || message.email!.subject
      : message.text
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function messagePreview(message: MessageContent): string {
  const words = content(message).split(/\s+/).filter(Boolean);
  return words.length
    ? `${words.slice(0, 10).join(" ")}${words.length > 10 ? "…" : ""}`
    : "Message content unavailable";
}

/** Content summaries only, never an assessment or an independently verified fact. */
export function summarizeMessage(message: MessageContent): string {
  const text = content(message);
  if (!text) return "No readable message content is available.";
  const words = text.split(/\s+/);
  const excerpt = `Message excerpt: “${words.slice(0, 35).join(" ")}${words.length > 35 ? "…" : ""}”`;
  const normalized = normalizeText(text);
  if (
    hasRequest(
      normalized,
      "send|share|give|provide",
      "otp|pin|password|card details",
    )
  )
    return excerpt;
  const protection =
    /\b(?:never|do not|don't)\s+share\b.{0,80}\b(?:otp|pin|password|card details)\b/i.test(
      text,
    );
  const card = text.match(
    /\b(credit card|debit card|card)\b.{0,80}\b(?:has been|was|is) delivered\b/i,
  );
  if (
    card &&
    !/\b(?:no|not|never|example|scam|if)\b/i.test(text.slice(0, card.index))
  )
    return `This message says a ${card[1].toLowerCase()} has been delivered.${protection ? " It also advises keeping banking details private." : ""}`;
  const account = text.match(
    /\baccount\b.{0,35}\b(?:will be|is|may be) (blocked|suspended|closed)\b/i,
  );
  if (account && hasRequest(normalized, "verify|update|complete", "kyc"))
    return `This message warns about an account being ${account[1].toLowerCase()} and asks for KYC verification.`;
  if (/\bstatement (?:is |is now )?(?:available|ready)\b/i.test(text))
    return "This message says an account statement is available.";
  if (protection && text.split(/\s+/).length <= 40)
    return "This message advises against sharing private banking codes or details.";
  return excerpt;
}
