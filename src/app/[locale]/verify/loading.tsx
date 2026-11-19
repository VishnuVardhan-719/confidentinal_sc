import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function VerifyLoading() {
  return (
    <div className="mx-auto w-full max-w-content px-4 py-10 sm:px-6 lg:px-8">
      <LoadingSkeleton variant="list" rows={3} />
    </div>
  );
}
