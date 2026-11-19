import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function PatientNotificationsLoading() {
  return <LoadingSkeleton variant="list" rows={4} />;
}
