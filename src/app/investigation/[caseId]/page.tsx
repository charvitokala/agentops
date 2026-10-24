import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Investigation } from "@/components/investigation";
import { LocalInvestigation } from "@/components/local-investigation";
import { getDemoCase } from "@/lib/demo-cases";
import { LOCAL_CASE_PATTERN } from "@/lib/local-investigations";
import { EXTENSION_CASE_PATTERN } from "@/lib/extension-cases";
import { ExtensionInvestigation } from "@/components/extension-investigation";

interface InvestigationPageProps {
  params: Promise<{ caseId: string }>;
}

export async function generateMetadata({
  params,
}: InvestigationPageProps): Promise<Metadata> {
  const { caseId } = await params;
  const item = getDemoCase(caseId);
  if (
    !item &&
    !LOCAL_CASE_PATTERN.test(caseId) &&
    !EXTENSION_CASE_PATTERN.test(caseId)
  )
    notFound();
  return { title: item?.title ?? "Local investigation" };
}

export default async function InvestigationPage({
  params,
}: InvestigationPageProps) {
  const { caseId } = await params;
  const item = getDemoCase(caseId);
  if (item) return <Investigation item={item} />;
  if (EXTENSION_CASE_PATTERN.test(caseId))
    return <ExtensionInvestigation caseId={caseId} />;
  if (LOCAL_CASE_PATTERN.test(caseId))
    return <LocalInvestigation caseId={caseId} />;
  notFound();
}
