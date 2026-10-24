import type { Metadata } from "next";
import { MessageAnalyzer } from "@/components/analyzer";
import { PageHeader } from "@/components/ui";
import { LockKeyhole } from "lucide-react";

export const metadata: Metadata = { title: "Message analyzer" };

export default function DemoPage() {
  return (
    <>
      <PageHeader
        eyebrow="A MOMENT TO CHECK. A LITTLE MORE CLARITY."
        title="Look before you trust."
        description="A simple first check for the financial messages that make you pause."
        action={
          <span className="outline-pill">
            <LockKeyhole size={13} aria-hidden="true" />
            Local processing only
          </span>
        }
      />
      <MessageAnalyzer />
    </>
  );
}
