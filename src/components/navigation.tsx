"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  FlaskConical,
  LayoutGrid,
  LockKeyhole,
  MessageSquareText,
  Scale,
  ShieldCheck,
} from "lucide-react";

export function AppNavigation() {
  const pathname = usePathname();
  const isInvestigation = pathname.startsWith("/investigation/");
  const brand = (
    <Link href="/" className="brand" aria-label="VerdictAI Guardian home">
      <span className="brand-icon">
        <ShieldCheck size={25} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span>
        VerdictAI<span className="brand-subtitle">GUARDIAN</span>
      </span>
    </Link>
  );
  return (
    <>
      {!isInvestigation && (
        <aside className="sidebar" aria-label="Application sidebar">
          {brand}
          <div className="workspace-label">YOUR WORKSPACE</div>
          <nav aria-label="Main navigation" className="main-nav">
            <Link
              href="/"
              className={`nav-link ${pathname === "/" ? "active" : ""}`}
              aria-current={pathname === "/" ? "page" : undefined}
            >
              <LayoutGrid size={18} aria-hidden="true" />
              Overview
            </Link>
            <Link
              href="/demo"
              className={`nav-link ${pathname === "/demo" ? "active" : ""}`}
              aria-current={pathname === "/demo" ? "page" : undefined}
            >
              <MessageSquareText size={18} aria-hidden="true" />
              Message analyzer
            </Link>
            <Link href="/#courtroom" className="nav-link">
              <Scale size={18} aria-hidden="true" />
              The courtroom<span className="nav-soon">Soon</span>
            </Link>
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-extension">
              <span className="icon-tile small">
                <ShieldCheck size={20} aria-hidden="true" />
              </span>
              <h2>
                Protection, right where
                <br />
                you need it.
              </h2>
              <p>WhatsApp Web integration is coming in a future phase.</p>
              <Link href="/#extension">
                Explore what’s next
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
            <p className="sidebar-privacy">
              <LockKeyhole size={13} aria-hidden="true" />
              Your messages stay yours.
            </p>
          </div>
        </aside>
      )}
      <div
        className={`main-shell${isInvestigation ? " investigation-shell" : ""}`}
      >
        <header className="topbar">
          {isInvestigation ? (
            brand
          ) : (
            <span className="topbar-title">Financial peace of mind.</span>
          )}
          <span className="demo-label">
            <FlaskConical size={14} aria-hidden="true" />
            Local demo<span className="desktop-only"> · Phase 1A</span>
          </span>
        </header>
      </div>
    </>
  );
}
