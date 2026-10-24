import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Investigation } from "@/components/investigation";
import { LocalInvestigation } from "@/components/local-investigation";
import { getDemoCase } from "@/lib/demo-cases";
import { LOCAL_CASE_PATTERN } from "@/lib/local-investigations";
import { EXTENSION_CASE_PATTERN } from "@/lib/extension-cases";
import { ExtensionInvestigation } from "@/components/extension-investigation";

interface InvestigationDetailPageProps {
  params: Promise<{ caseId: string; view: string }>;
}

function resolveView(view: string) {
  if (view !== "evidence" && view !== "next-steps") notFound();
  return view;
}

export async function generateMetadata({
  params,
}: InvestigationDetailPageProps): Promise<Metadata> {
  const { caseId, view } = await params;
  const resolvedView = resolveView(view);
  const item = getDemoCase(caseId);
  if (
    !item &&
    !LOCAL_CASE_PATTERN.test(caseId) &&
    !EXTENSION_CASE_PATTERN.test(caseId)
  )
    notFound();
  const title =
    resolvedView === "evidence"
      ? "Evidence and Sources"
      : "What Should I Do Next?";
  return { title: `${title} · ${item?.title ?? "Local investigation"}` };
}

export default async function InvestigationDetailPage({
  params,
}: InvestigationDetailPageProps) {
  const { caseId, view } = await params;
  const resolvedView = resolveView(view);
  const item = getDemoCase(caseId);
  if (item) return <Investigation item={item} view={resolvedView} />;
  if (EXTENSION_CASE_PATTERN.test(caseId))
    return <ExtensionInvestigation caseId={caseId} view={resolvedView} />;
  if (LOCAL_CASE_PATTERN.test(caseId))
    return <LocalInvestigation caseId={caseId} view={resolvedView} />;
  notFound();
}
