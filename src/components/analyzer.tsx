"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  CircleHelp,
  FileSearch,
  LockKeyhole,
  MessageSquareText,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import {
  ActionRecommendation,
  EmptyState,
  LoadingState,
  RiskBadge,
  ScamIndicatorCard,
} from "@/components/ui";
import { analyzeMessage, MAX_MESSAGE_LENGTH } from "@/lib/analysis";
import { demoCases, matchDemoMessage } from "@/lib/demo-cases";
import { saveLocalInvestigation } from "@/lib/local-investigations";
import type { ScamCase } from "@/lib/contracts";

export function MessageAnalyzer() {
  const [text, setText] = useState("");
  const [sample, setSample] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScamCase | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function updateText(value: string, sampleId = "") {
    setText(value);
    setSample(sampleId);
    setResult(null);
    setError("");
  }

  function analyze() {
    if (!text.trim()) {
      setError("Add a message or choose a sample to begin.");
      return;
    }
    setError("");
    setResult(null);
    setLoading(true);
    timer.current = setTimeout(() => {
      try {
        const item =
          matchDemoMessage(text) ??
          analyzeMessage(
            text,
            `local-${crypto.randomUUID()}`,
            new Date().toISOString(),
          );
        setResult(item);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The assessment could not be completed. Please try again.",
        );
      } finally {
        setLoading(false);
      }
    }, 650);
  }

  function openInvestigation() {
    if (!result) return;
    if (result.message.source !== "demo") {
      try {
        saveLocalInvestigation(result);
      } catch {
        setError(
          "Your browser could not save this investigation for this tab. Enable session storage or use a demonstration case. Your preliminary insights remain visible here.",
        );
        return;
      }
    }
    router.push(`/investigation/${result.id}`);
  }

  return (
    <>
      <div className="analyzer-grid">
        <section className="card input-panel" aria-labelledby="input-heading">
          <div className="section-title">
            <div className="flex items-center gap-2">
              <MessageSquareText size={19} aria-hidden="true" />
              <h2 id="input-heading">Start with a message</h2>
            </div>
            <span className="quiet-label">Text only</span>
          </div>
          <p className="section-description">
            Paste a suspicious financial message, or explore a sample.
          </p>
          <label className="field-label" htmlFor="sample">
            Try a demonstration case
          </label>
          <div className="select-wrap">
            <select
              id="sample"
              value={sample}
              disabled={loading}
              onChange={(event) => {
                const item = demoCases.find(
                  (item) => item.id === event.target.value,
                );
                updateText(item?.message.text ?? "", item?.id ?? "");
              }}
            >
              <option value="">Choose a sample message</option>
              {demoCases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </div>
          <div className="flex items-center justify-between gap-2 mt-6">
            <label className="field-label !m-0" htmlFor="message">
              Message to analyze
            </label>
            <button
              className="text-button"
              type="button"
              disabled={loading || !text}
              onClick={() => updateText("")}
            >
              Clear
            </button>
          </div>
          <textarea
            id="message"
            value={text}
            onChange={(event) => updateText(event.target.value)}
            disabled={loading}
            placeholder="Paste the message here. For example, a request to update your KYC, share an OTP, or invest in a guaranteed-return scheme…"
            maxLength={MAX_MESSAGE_LENGTH}
            aria-describedby={`message-hint${error ? " analyzer-error" : ""}`}
            aria-invalid={Boolean(error)}
          />
          <div className="input-meta">
            <span id="message-hint">
              Remove personal details before pasting.
            </span>
            <span>
              {text.length.toLocaleString()} /{" "}
              {MAX_MESSAGE_LENGTH.toLocaleString()}
            </span>
          </div>
          <button
            className="button button-primary analyze-button"
            type="button"
            onClick={analyze}
            disabled={loading || !text.trim()}
          >
            <ScanLine size={17} aria-hidden="true" />
            {loading ? "Analyzing message…" : "Analyze Message"}
            <ArrowRight size={16} className="ml-auto" aria-hidden="true" />
          </button>
          {error && (
            <p id="analyzer-error" className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="input-privacy">
            <LockKeyhole size={16} className="shrink-0" aria-hidden="true" />
            <p>
              Your message is processed locally. Custom investigations stay in
              this browser tab’s session storage. Closing the tab may remove
              them.
            </p>
          </div>
        </section>

        <section
          className={`card insights-panel ${result ? "has-result" : ""}`}
          aria-labelledby="insights-heading"
          aria-busy={loading}
        >
          <div className="section-title">
            <div className="flex items-center gap-2">
              <FileSearch size={19} aria-hidden="true" />
              <h2 id="insights-heading">Preliminary insights</h2>
            </div>
            {result && <RiskBadge level={result.assessment.level} />}
          </div>
          <div aria-live="polite" aria-atomic="true">
            {loading ? (
              <LoadingState />
            ) : !result ? (
              <EmptyState
                icon={ScanLine}
                title="A clearer picture starts here."
                description="Analyze a message to see its warning signs, a preliminary risk assessment, and practical next steps."
              />
            ) : (
              <div className="results-content">
                <p className="assessment-label">
                  Preliminary rule-based assessment.
                </p>
                <h3 className="result-heading">
                  {result.assessment.level === "high"
                    ? "Pause. This deserves a closer look."
                    : result.assessment.level === "medium"
                      ? "A few details call for caution."
                      : "No strong patterns detected."}
                </h3>
                <p className="result-summary">{result.assessment.summary}</p>
                <div className="result-divider" />
                <h4 className="subheading">
                  Detected signals<span>{result.signals.length}</span>
                </h4>
                {result.signals.length ? (
                  <div className="indicator-list">
                    {result.signals.map((signal) => (
                      <ScamIndicatorCard signal={signal} key={signal.id} />
                    ))}
                  </div>
                ) : (
                  <p className="low-indicator-note">
                    <ShieldCheck size={18} aria-hidden="true" />
                    No strong scam indicators detected. This message is not
                    verified or confirmed safe.
                  </p>
                )}
                <h4 className="subheading mt-6">Suggested next steps</h4>
                <ol className="actions-list compact-actions">
                  {result.actions.slice(0, 2).map((action, index) => (
                    <ActionRecommendation
                      action={action}
                      index={index}
                      key={action.id}
                    />
                  ))}
                </ol>
                <button
                  className="button button-primary investigation-button"
                  type="button"
                  onClick={openInvestigation}
                >
                  Open detailed investigation
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
                <p className="caption mt-3">
                  No real AI analysis or external verification has taken place.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
      <aside className="demo-explainer">
        <CircleHelp size={19} className="shrink-0" aria-hidden="true" />
        <div>
          <h2>A first look, not a final verdict.</h2>
          <p>
            This demo checks for local text patterns, including urgency,
            requests for sensitive codes, unfamiliar links, and investment
            claims. It cannot verify a sender or determine whether a message is
            fraudulent.{" "}
            <Link href="/investigation/demo-kyc-001">
              Explore an example investigation
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </aside>
    </>
  );
}
