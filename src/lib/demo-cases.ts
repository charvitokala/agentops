import { analyzeMessage } from "./analysis.ts";
import type { ScamCase } from "./contracts.ts";

const examples = [
  {
    id: "demo-kyc-001",
    title: "Urgent KYC update",
    date: "2026-10-20T10:30:00.000Z",
    text: "Dear customer, your bank account will be blocked within 30 minutes. Complete KYC immediately at https://secure-kyc-update.example or lose access.",
  },
  {
    id: "demo-otp-002",
    title: "A request for your OTP",
    date: "2026-10-19T14:15:00.000Z",
    text: "Your bank security team needs the OTP you just received to cancel an unauthorized transfer. Reply with the six-digit code immediately.",
  },
  {
    id: "demo-investment-003",
    title: "Guaranteed monthly returns",
    date: "2026-10-18T09:45:00.000Z",
    text: "Join our investment group and earn guaranteed 15% returns every month. Limited seats available. Message us to start.",
  },
  {
    id: "demo-statement-004",
    title: "Monthly statement notification",
    date: "2026-10-17T08:00:00.000Z",
    text: "Your monthly account statement is available in your banking app. Please sign in through your usual banking channel to view it.",
  },
];

export const demoCases: ScamCase[] = examples.map((example) => {
  const result = analyzeMessage(example.text, example.id, example.date);
  return {
    ...result,
    title: example.title,
    message: { ...result.message, source: "demo" },
    note: { ...result.note, status: "illustrative" },
  };
});

export function getDemoCase(id: string): ScamCase | undefined {
  return demoCases.find((item) => item.id === id);
}

export function matchDemoMessage(text: string): ScamCase | undefined {
  return demoCases.find((item) => item.message.text === text.trim());
}

export const demoMetrics = {
  messagesAnalyzed: demoCases.length,
  potentialThreats: demoCases.filter((item) => item.assessment.level !== "low")
    .length,
  investigations: demoCases.length,
};
