import Link from "next/link";
import { EmptyState } from "@/components/studio";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <EmptyState
      title="Workspace not found"
      description="This page is not part of the studio."
    >
      <Link
        href="/characters"
        className={buttonVariants({ variant: "outline" })}
      >
        Return to characters
      </Link>
    </EmptyState>
  );
}
