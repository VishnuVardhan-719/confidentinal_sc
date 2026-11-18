import { Container } from "@/components/public/layout";
import { Skeleton } from "@/components/ui/skeleton";

/** Layout-matching placeholder; no fake counts or names. */
export function DoctorSearchSkeleton() {
  return (
    <Container className="grid gap-8 pb-20" aria-hidden>
      <Skeleton className="h-14 w-full rounded-lg" />
      <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="hidden gap-4 lg:grid">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-11" />)}</div>
        <div className="grid gap-4">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-48 rounded-lg" />)}</div>
      </div>
    </Container>
  );
}
