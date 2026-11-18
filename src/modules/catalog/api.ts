/** Catalog and providers share the same service-level public contract. */
export { createProvidersApi as createCatalogApi } from "@/modules/providers/api";
export type { ProvidersApi as CatalogApi } from "@/modules/providers/api";
