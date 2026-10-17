"use client";
import { QueryError } from "@/components/studio";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <QueryError error={error} retry={reset} />;
}
