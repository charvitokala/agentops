"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, FolderSearch } from "lucide-react";
import {
  Investigation,
  type InvestigationView,
} from "@/components/investigation";
import { EmptyState, LoadingState } from "@/components/ui";
import {
  extensionCaseToScamCase,
  loadExtensionCase,
} from "@/lib/extension-cases";
import { receiveExtensionCase } from "@/lib/extension-receiver";
import type { ScamCase } from "@/lib/contracts";

export function ExtensionInvestigation({
  caseId,
  view = "courtroom",
}: {
  caseId: string;
  view?: InvestigationView;
}) {
  const [item, setItem] = useState<ScamCase | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setItem(null);
    setError("");
    try {
      const stored = loadExtensionCase(
        window.sessionStorage,
        caseId,
        window.location.origin,
      );
      if (stored) {
        setItem(extensionCaseToScamCase(stored));
        return;
      }
    } catch {
      /* Storage unavailable: the receiver supplies a clear error. */
    }
    return receiveExtensionCase(
      window,
      caseId,
      (payload) => setItem(extensionCaseToScamCase(payload)),
      setError,
    );
  }, [caseId]);
  if (item?.id === caseId)
    return <Investigation key={caseId} item={item} view={view} />;
  if (!error)
    return (
      <section className="card">
        <LoadingState label="Opening your extension investigation…" />
      </section>
    );
  return (
    <section className="card unavailable-state">
      <EmptyState
        icon={FolderSearch}
        title="This extension investigation isn’t available."
        description={error}
        action={
          <Link className="button button-primary" href="/">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to overview
          </Link>
        }
      />
    </section>
  );
}
