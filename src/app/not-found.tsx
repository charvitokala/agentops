import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="card unavailable-state">
      <p className="eyebrow text-center pt-10">404 · NOT FOUND</p>
      <EmptyState
        icon={FileQuestion}
        title="We couldn’t find that page."
        description="This case identifier may be incorrect, or the page may not exist. Return to the overview to explore the demonstration investigations."
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
