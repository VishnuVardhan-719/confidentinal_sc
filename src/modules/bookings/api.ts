import type { ApiResult } from "@/lib/api/result";
import { getAdapterMode } from "@/lib/api/mode";
import type { FixtureEnvironment } from "@/lib/api/fixture";
import type { Booking, BookingAccept, BookingDecision, BookingEvent, BookingList, BookingReschedule, CreateBooking } from "./schemas";
import { createSessionHttpClient } from "@/modules/auth/session-token";
import { createBookingsHttpApi } from "./http";
import { createBookingsFixtureApi } from "./fixture";
export interface BookingsApi {
  create(input: CreateBooking, idempotencyKey: string): Promise<ApiResult<{ id: string }>>;
  list(filters?: BookingList): Promise<ApiResult<{ items: Booking[] }>>;
  get(id: string): Promise<ApiResult<Booking>>;
  accept(id: string, input: BookingAccept): Promise<ApiResult<{ version: number }>>;
  decline(id: string, input: BookingDecision): Promise<ApiResult<{ version: number }>>;
  cancel(id: string, input: BookingDecision): Promise<ApiResult<{ version: number }>>;
  timeline(id: string): Promise<ApiResult<{ items: BookingEvent[] }>>;
  reschedule(id: string, input: BookingReschedule): Promise<ApiResult<{ version: number }>>;
}
export function createBookingsApi(env?: FixtureEnvironment): BookingsApi {
  return getAdapterMode(env) === "fixture" ? createBookingsFixtureApi({ env }) : createBookingsHttpApi(createSessionHttpClient());
}
