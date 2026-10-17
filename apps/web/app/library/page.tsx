import { Suspense } from "react";
import { LibraryView } from "@/components/library/library-view";
import { Loading } from "@/components/studio";
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <LibraryView />
    </Suspense>
  );
}
