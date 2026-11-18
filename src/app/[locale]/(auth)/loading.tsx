import { Container } from "@/components/public/layout";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

export default function AuthLoading() {
  return (
    <Container className="py-10 md:py-16">
      <LoadingSkeleton variant="detail" rows={4} />
    </Container>
  );
}
