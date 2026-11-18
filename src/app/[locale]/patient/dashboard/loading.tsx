import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function PatientDashboardLoading() {
  return <LoadingSkeleton variant="list" rows={4} />;
}
