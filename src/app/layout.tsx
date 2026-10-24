import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppNavigation } from "@/components/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VerdictAI Guardian — Financial peace of mind",
    template: "%s · VerdictAI Guardian",
  },
  description:
    "A private, local demonstration of financial scam detection. Explore preliminary rule-based insights with VerdictAI Guardian.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AppNavigation />
        <div className="content-shell">
          <main id="main-content" className="page-content">
            {children}
          </main>
          <footer className="app-footer">
            <span>VerdictAI Guardian</span>
            <span>Thoughtful protection. Informed decisions.</span>
            <span>Phase 1A · Local demonstration</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
