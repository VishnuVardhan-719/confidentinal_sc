import type { AdapterMode } from "@/lib/api/mode";
import type { ApiResult } from "@/lib/api/result";
import type { CatalogUpdateInput } from "./rules";
import type {
  CollectionActionInput,
  LabBranch,
  LabCatalogItem,
  LabOrder,
  LabReport,
  LabReportState,
  LabStaffMember,
  Page,
  ReportDecisionInput,
} from "./types";

/** `scheduled` lists every scheduled or in-progress collection on any day, so no confirmed order is missing from all queues. */
export type LabOrderQueue = "pending" | "today" | "scheduled" | "processing" | "exceptions";

/**
 * Typed lab module API. Two adapters: http (contracts, proposed) and fixture
 * (synthetic). Every method resolves to ApiResult; nothing throws for
 * expected failures.
 */
export interface LabApi {
  readonly mode: AdapterMode;
  listBranches(): Promise<ApiResult<LabBranch[]>>;
  listCatalog(input?: { branchId?: string }): Promise<ApiResult<LabCatalogItem[]>>;
  listStaff(input?: { branchId?: string }): Promise<ApiResult<LabStaffMember[]>>;
  /** Manager only. Activation requires a verified branch; deactivation never cancels accepted work. */
  setBranchActive(input: { branchId: string; active: boolean; expectedVersion: number; idempotencyKey: string }): Promise<ApiResult<LabBranch>>;
  /** Manager only. Server validates price (integer paise), plain-text preparation and the active flag. */
  updateCatalogItem(input: CatalogUpdateInput & { itemId: string; expectedVersion: number; idempotencyKey: string }): Promise<ApiResult<LabCatalogItem>>;
  listOrders(input: { queue: LabOrderQueue; cursor?: string }): Promise<ApiResult<Page<LabOrder>>>;
  getOrder(orderId: string): Promise<ApiResult<LabOrder>>;
  /** Collector view: only orders assigned to the signed-in collector. */
  listAssignedCollections(): Promise<ApiResult<LabOrder[]>>;
  performCollectionAction(input: CollectionActionInput): Promise<ApiResult<LabOrder>>;
  /** Creates a new recollection booking request; never resets the failed order. */
  requestRecollection(input: { orderId: string; idempotencyKey: string }): Promise<ApiResult<{ newOrderReference: string }>>;
  /** Reviewer queue. Gated behind the clinical gate (lab report release). */
  listReports(input?: { state?: LabReportState }): Promise<ApiResult<LabReport[]>>;
  reviewReport(input: ReportDecisionInput): Promise<ApiResult<LabReport>>;
  releaseReport(input: ReportDecisionInput): Promise<ApiResult<LabReport>>;
}
