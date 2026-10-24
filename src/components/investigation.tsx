"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleHelp,
  FileSearch,
  ShieldAlert,
} from "lucide-react";
import {
  ActionRecommendation,
  CommunityNote,
  Courtroom,
  EvidenceStatus,
  MessageCard,
  RiskBadge,
  ScamIndicatorCard,
} from "@/components/ui";
import type { ScamCase } from "@/lib/contracts";

export type InvestigationView = "courtroom" | "evidence" | "next-steps";

const investigationTabs = [
  { view: "courtroom", label: "Courtroom" },
  { view: "evidence", label: "Evidence" },
  { view: "next-steps", label: "Actions" },
] as const;

export function Investigation({
  item,
  view = "courtroom",
}: {
  item: ScamCase;
  view?: InvestigationView;
}) {
  const [activeView, setActiveView] = useState<InvestigationView>(view);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const courtroomHref = `/investigation/${item.id}#courtroom`;
  const isCourtroom = view === "courtroom";
  const title = isCourtroom
    ? item.title
    : view === "evidence"
      ? "Evidence and Sources"
      : "What Should I Do Next?";
  const date = new Date(item.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <>
      <Link
        href={
          isCourtroom
            ? item.message.source === "demo"
              ? "/"
              : "/demo"
            : courtroomHref
        }
        className="back-link"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {!isCourtroom
          ? "Back to Courtroom"
          : item.message.source === "demo"
            ? "Back to overview"
            : "Back to analyzer"}
      </Link>
      <header className="investigation-header">
        <div>
          <p className="eyebrow">MESSAGE INVESTIGATION</p>
          <h1>{title}</h1>
          {!isCourtroom && <p className="section-description">{item.title}</p>}
          <div className="case-metadata">
            <span>{item.id}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={item.createdAt}>{date} UTC</time>
            <span className="outline-pill">
              {item.message.source === "demo"
                ? "Fictional demonstration"
                : "This browser tab only"}
            </span>
          </div>
        </div>
        <Link href="/demo" className="button button-secondary">
          Analyze another
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>
      <div
        className="investigation-tabs"
        role="tablist"
        aria-label="Investigation views"
      >
        {investigationTabs.map((tab, index) => (
          <button
            key={tab.view}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`investigation-tab-${tab.view}`}
            type="button"
            role="tab"
            aria-selected={activeView === tab.view}
            aria-controls={`investigation-panel-${tab.view}`}
            tabIndex={activeView === tab.view ? 0 : -1}
            onClick={() => setActiveView(tab.view)}
            onKeyDown={(event) => {
              let nextIndex: number;
              switch (event.key) {
                case "ArrowRight":
                  nextIndex = (index + 1) % investigationTabs.length;
                  break;
                case "ArrowLeft":
                  nextIndex =
                    (index - 1 + investigationTabs.length) %
                    investigationTabs.length;
                  break;
                case "Home":
                  nextIndex = 0;
                  break;
                case "End":
                  nextIndex = investigationTabs.length - 1;
                  break;
                default:
                  return;
              }
              event.preventDefault();
              setActiveView(investigationTabs[nextIndex].view);
              tabRefs.current[nextIndex]?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id="investigation-panel-courtroom"
        role="tabpanel"
        aria-labelledby="investigation-tab-courtroom"
        tabIndex={0}
        hidden={activeView !== "courtroom"}
      >
        <section
          className={`card assessment-banner assessment-${item.assessment.level}`}
          aria-labelledby="assessment-heading"
        >
          <div className="assessment-icon">
            <ShieldAlert size={27} strokeWidth={1.6} aria-hidden="true" />
          </div>
          <div className="flex-1">
            <div className="flex items-center flex-wrap gap-3">
              <h2 id="assessment-heading">
                {item.assessment.level === "high"
                  ? "Strong warning patterns detected"
                  : item.assessment.level === "medium"
                    ? "Some warning patterns detected"
                    : "No strong scam indicators detected"}
              </h2>
              <RiskBadge level={item.assessment.level} />
            </div>
            <p>{item.assessment.summary}</p>
            <span className="assessment-label">
              Preliminary rule-based assessment.
            </span>
          </div>
        </section>
        <MessageCard text={item.message.text} source={item.message.source} />
        <Courtroom agents={item.agents} />
      </div>
      <div
        id="investigation-panel-evidence"
        role="tabpanel"
        aria-labelledby="investigation-tab-evidence"
        tabIndex={0}
        hidden={activeView !== "evidence"}
      >
        <div className="investigation-main">
          <section className="card section-card">
            <div className="section-title">
              <h2>Evidence status</h2>
              <span className="outline-pill">Not verified</span>
            </div>
            <EvidenceStatus />
            <ul className="evidence-list">
              {item.evidence.map((source) => (
                <li key={source.id}>
                  <span>{source.label}</span>
                  <span className="quiet-label">Unverified · text only</span>
                </li>
              ))}
            </ul>
            <p className="caption mt-3">
              No external evidence has been collected. Message text is the only
              input to this assessment.
            </p>
          </section>
          <CommunityNote note={item.note} />
          <section
            className="card section-card"
            aria-labelledby="indicators-heading"
          >
            <div className="section-title">
              <div className="flex items-center gap-2">
                <FileSearch size={18} aria-hidden="true" />
                <h2 id="indicators-heading">Detected scam indicators</h2>
              </div>
              <span className="count-badge">{item.signals.length}</span>
            </div>
            <p className="section-description mb-4">
              Expand a signal to see why it was flagged.
            </p>
            {item.signals.length ? (
              <div className="indicator-list">
                {item.signals.map((signal) => (
                  <ScamIndicatorCard signal={signal} key={signal.id} />
                ))}
              </div>
            ) : (
              <div className="no-indicators">
                <CircleHelp size={20} aria-hidden="true" />
                <p>
                  No strong scam indicators detected by the current rules. This
                  is not a safety guarantee, and the message has not been
                  verified.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
      <div
        id="investigation-panel-next-steps"
        role="tabpanel"
        aria-labelledby="investigation-tab-next-steps"
        tabIndex={0}
        hidden={activeView !== "next-steps"}
      >
        <section className="card section-card">
          <div className="section-title">
            <h2>What to do next</h2>
          </div>
          <p className="section-description">
            A few considered steps before you act.
          </p>
          <ol className="actions-list">
            {item.actions.map((action, index) => (
              <ActionRecommendation
                action={action}
                index={index}
                key={action.id}
              />
            ))}
          </ol>
        </section>
      </div>
      <section className="card section-card assessment-limits mt-5">
        <div className="flex items-center gap-2 mb-3">
          <CircleHelp size={17} aria-hidden="true" />
          <h2>Know the limits</h2>
        </div>
        <p>{item.assessment.limitations}</p>
        <p className="mt-3">
          No external citations or AI verdicts are available in this phase.
        </p>
      </section>
    </>
  );
}
