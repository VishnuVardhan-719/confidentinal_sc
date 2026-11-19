import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function PatientRecordsLoading() {
  return <LoadingSkeleton variant="list" rows={4} />;
}
