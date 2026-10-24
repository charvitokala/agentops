"use client";

import { EmptyState } from "@/components/ui";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="card unavailable-state">
      <EmptyState
        title="This page couldn’t be opened."
        description="Please try loading the page again. Any custom investigation is available only while its browser session storage is retained."
        action={
          <button
            className="button button-primary"
            type="button"
            onClick={reset}
          >
            Try again
          </button>
        }
      />
    </section>
  );
}
