import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function PatientRecordLoading() {
  return <LoadingSkeleton variant="list" rows={4} />;
}
