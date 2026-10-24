"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FolderSearch } from "lucide-react";
import {
  Investigation,
  type InvestigationView,
} from "@/components/investigation";
import { EmptyState, LoadingState } from "@/components/ui";
import { loadLocalInvestigation } from "@/lib/local-investigations";
import type { ScamCase } from "@/lib/contracts";

export function LocalInvestigation({
  caseId,
  view = "courtroom",
}: {
  caseId: string;
  view?: InvestigationView;
}) {
  const [item, setItem] = useState<ScamCase | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setItem(loadLocalInvestigation(caseId));
    setLoaded(true);
  }, [caseId]);
  if (!loaded)
    return (
      <section className="card">
        <LoadingState label="Opening your local investigation…" />
      </section>
    );
  if (!item)
    return (
      <section className="card unavailable-state">
        <EmptyState
          icon={FolderSearch}
          title="This local investigation isn’t available."
          description="Custom investigations are stored only in the browser tab where you created them. The tab may have been closed, storage may have been cleared, or this link may be open in a different session. Paste the original message into the analyzer to assess it again."
          action={
            <Link className="button button-primary" href="/demo">
              Return to analyzer
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          }
        />
      </section>
    );
  return <Investigation item={item} view={view} />;
}
