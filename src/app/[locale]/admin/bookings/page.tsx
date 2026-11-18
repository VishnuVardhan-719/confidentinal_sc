import { getTranslations } from "next-intl/server";
import { AdminRouteGate } from "@/components/admin/admin-frame";
import { BookingOpsView } from "@/components/admin/admin-views";
import { privateMetadata } from "@/components/admin/ops/metadata";
import { loadBookingByReference, loadBookingExceptions } from "@/modules/admin/loaders";
import { bookingLookupReference } from "@/modules/admin/session";

export async function generateMetadata() {
  return privateMetadata((await getTranslations("admin.nav"))("bookings"));
}

/** The searched reference comes from a short-lived httpOnly cookie, never from the URL. */
export default function Page() {
  return (
    <AdminRouteGate route="bookings">
      {async (ctx) => {
        const reference = await bookingLookupReference();
        const [lookup, exceptions] = await Promise.all([reference ? loadBookingByReference(ctx, reference) : null, loadBookingExceptions(ctx)]);
        return <BookingOpsView lookup={lookup} exceptions={exceptions} />;
      }}
    </AdminRouteGate>
  );
}