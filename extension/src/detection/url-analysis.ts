import { FINANCIAL_CONTEXT, WEIGHTS } from "./rules.ts";
import type { DetectedSignal } from "./types.ts";

// Infrastructure cues only. These are not malicious-domain or official-bank lists.
const SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "cutt.ly",
  "is.gd",
  "ow.ly",
  "rb.gy",
  "shorturl.at",
  "rebrand.ly",
]);
const FINANCIAL_NAME_CUES = [
  "sbi",
  "hdfc",
  "icici",
  "axisbank",
  "kotak",
  "paypal",
  "paytm",
  "phonepe",
];

export function analyzeUrls(
  text: string,
  extractedUrls: readonly string[],
): DetectedSignal | null {
  const reasons = new Set<string>();
  const inline = text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) ?? [];
  for (const candidate of new Set([...extractedUrls, ...inline])) {
    try {
      const trimmed = candidate.trim().replace(/[.,;!?)\]]+$/, "");
      const url = new URL(
        /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`,
      );
      if (!["http:", "https:"].includes(url.protocol)) continue;
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      const labels = host.split(".");
      if (
        SHORTENERS.has(host) ||
        (host.startsWith("www.") && SHORTENERS.has(host.slice(4)))
      )
        reasons.add("A shortened link hides its final destination");
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("["))
        reasons.add("The link uses a numeric network address");
      if (labels.some((label) => label.startsWith("xn--")))
        reasons.add(
          "The domain uses encoded international characters, which can resemble other names",
        );
      const normalizedNames = [
        host
          .replace(/0/g, "o")
          .replace(/1/g, "l")
          .replace(/3/g, "e")
          .replace(/5/g, "s"),
        host
          .replace(/0/g, "o")
          .replace(/1/g, "i")
          .replace(/3/g, "e")
          .replace(/5/g, "s"),
      ];
      if (
        FINANCIAL_NAME_CUES.some(
          (name) =>
            !host.includes(name) &&
            normalizedNames.some((value) => value.includes(name)),
        )
      )
        reasons.add("The domain contains a financial-name lookalike");
      // Conservative structural exception for common multi-label country suffixes,
      // not an authoritative public-suffix or bank-ownership lookup.
      const suffixLabels = /\.(?:co|com|org|net|ac|gov)\.[a-z]{2}$/.test(host)
        ? 3
        : 2;
      if (
        labels.length > suffixLabels &&
        FINANCIAL_NAME_CUES.some((name) =>
          labels.slice(0, -suffixLabels).some((label) => label.includes(name)),
        )
      )
        reasons.add(
          "A financial name appears in a subdomain; that does not establish who owns the site",
        );
      if (
        FINANCIAL_NAME_CUES.some((name) => host.includes(name)) &&
        labels.some((label) => label.includes("-")) &&
        /(?:^|[-.])(?:secure|verify|verification|update|login)(?:[-.]|$)/.test(
          host,
        )
      )
        reasons.add(
          "The domain combines a financial name with sign-in or verification wording",
        );
      if (labels.length >= 5)
        reasons.add("The domain has an unusually long subdomain chain");
      if (
        /\b(?:kyc|bank|account)\b/.test(host.replace(/[-.]/g, " ")) &&
        /\b(?:secure|verify|verification|update|login)\b/.test(
          host.replace(/[-.]/g, " "),
        )
      )
        reasons.add("The domain combines financial and verification words");
      if (
        /\b(?:bank|account)\b/.test(host.replace(/[-.]/g, " ")) &&
        /\bkyc\b/.test(host.replace(/[-.]/g, " "))
      )
        reasons.add(
          "The domain combines account or banking words with KYC verification wording",
        );
      if (
        url.protocol === "http:" &&
        (FINANCIAL_CONTEXT.test(text) ||
          FINANCIAL_CONTEXT.test(host + url.pathname))
      )
        reasons.add("The financial link uses unencrypted HTTP");
    } catch {
      /* Invalid URLs provide no domain evidence. Never fetch or resolve them. */
    }
  }
  return reasons.size
    ? {
        id: "url-pattern",
        label: "Link features need checking",
        explanation: `${[...reasons].join(". ")}. These features are indicators, not proof of fraud.`,
        weight: WEIGHTS.urlPattern,
      }
    : null;
}
