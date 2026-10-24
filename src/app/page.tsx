import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  CircleHelp,
  FileSearch,
  LockKeyhole,
  MessageSquareText,
  Monitor,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  AnalyzeLink,
  Courtroom,
  LocalPrivacyNote,
  PageHeader,
  RiskBadge,
  SummaryMetricCard,
} from "@/components/ui";
import { demoCases, demoMetrics } from "@/lib/demo-cases";
import { COURTROOM_AGENTS } from "@/lib/analysis";

export default function Dashboard() {
  const preview = demoCases[0];
  return (
    <>
      <PageHeader
        eyebrow="YOUR PERSONAL SCAM WATCH"
        title="Overview"
        action={
          <span className="outline-pill">
            <span className="neutral-dot" />
            Demonstration workspace
          </span>
        }
      />
      <section className="hero card" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="hero-kicker">
            <ShieldCheck size={16} aria-hidden="true" />A little clarity. A lot
            more confidence.
          </span>
          <h2 id="hero-title">
            Stay one step
            <br className="desktop-only" /> ahead of scams.
          </h2>
          <p>
            Make sense of suspicious financial messages.
            <br className="desktop-only" /> Spot the warning signs before you
            take the next step.
          </p>
          <div className="hero-actions">
            <AnalyzeLink />
            <span className="hero-action-note">
              No sign-up. No message uploads.
            </span>
          </div>
          <LocalPrivacyNote />
        </div>
        <div className="hero-preview">
          <div className="preview-label">
            <span className="icon-tile small">
              <MessageSquareText size={18} aria-hidden="true" />
            </span>
            <div>
              <p>A message worth a second look.</p>
              <span>Fictional KYC example</span>
            </div>
          </div>
          <div className="preview-message">
            “Dear customer, your bank account will be blocked within 30 minutes.
            Complete KYC immediately…”
          </div>
          <div className="preview-assessment">
            <RiskBadge level="high" />
            <span>3 warning signs</span>
          </div>
          <div className="preview-signals">
            {preview.signals.map((signal) => (
              <span key={signal.id}>
                <ShieldAlert size={13} aria-hidden="true" />
                {signal.title}
              </span>
            ))}
          </div>
          <p className="preview-footnote">Preliminary rule-based assessment.</p>
          <Link href={`/investigation/${preview.id}`} className="preview-link">
            Take a closer look
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section aria-label="Demonstration summary" className="metrics-grid">
        <SummaryMetricCard
          title="Messages Analyzed"
          value={demoMetrics.messagesAnalyzed}
          description="Fictional messages in this demo"
          icon={MessageSquareText}
        />
        <SummaryMetricCard
          title="Potential Threats"
          value={demoMetrics.potentialThreats}
          description="Sample cases with warning indicators"
          icon={ShieldAlert}
        />
        <SummaryMetricCard
          title="Investigations"
          value={demoMetrics.investigations}
          description="Preliminary case walkthroughs"
          icon={FileSearch}
        />
      </section>
      <p className="metrics-disclaimer">
        <CircleHelp size={13} aria-hidden="true" />
        All counts come from the four local demonstration cases. No live
        activity is tracked.
      </p>

      <section className="card recent-section" aria-labelledby="recent-heading">
        <div className="section-heading recent-heading">
          <div>
            <h2 id="recent-heading">Recent investigations</h2>
            <p className="section-description">
              Every message has a story. Look a little closer.
            </p>
          </div>
          <Link href="/demo" className="text-link">
            Analyze a message
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="investigation-table-heading" aria-hidden="true">
          <span>MESSAGE / CASE</span>
          <span>ASSESSMENT</span>
          <span>DATE</span>
          <span />
        </div>
        <ul className="investigation-list">
          {demoCases.map((item) => (
            <li key={item.id}>
              <Link
                href={`/investigation/${item.id}`}
                className="investigation-row"
              >
                <span className="case-info">
                  <span className="case-icon">
                    <MessageSquareText
                      size={19}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  </span>
                  <span>
                    <span className="case-title">{item.title}</span>
                    <span className="case-excerpt">{item.message.text}</span>
                  </span>
                </span>
                <RiskBadge level={item.assessment.level} />
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  })}
                </time>
                <ChevronRight
                  size={17}
                  className="text-secondary row-chevron"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
        <div className="list-footer">
          <span className="neutral-dot" />
          Fictional cases. Real opportunities to learn the warning signs.
        </div>
      </section>

      <Courtroom agents={COURTROOM_AGENTS} compact />
      <section id="extension" className="card extension-section">
        <div className="extension-icon">
          <Monitor size={31} strokeWidth={1.4} aria-hidden="true" />
          <span>
            <ShieldCheck size={16} aria-hidden="true" />
          </span>
        </div>
        <div className="flex-1">
          <span className="eyebrow">ON THE HORIZON</span>
          <h2>Peace of mind, inside WhatsApp Web.</h2>
          <p>
            A future Chrome extension will bring message checks closer to your
            conversations.
            <br className="desktop-only" /> For now, explore the experience
            here. No extension is connected.
          </p>
        </div>
        <span className="outline-pill">
          <LockKeyhole size={13} aria-hidden="true" />
          Coming in a future phase
        </span>
      </section>
    </>
  );
}
