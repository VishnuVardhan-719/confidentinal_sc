/**
 * Public surface of the shared UI kit. Import from "@/components/shared".
 * Props are documented in docs/frontend/COMPONENTS.md.
 * Client islands are marked "use client" in their own files; importing this barrel from a server
 * component is safe.
 */
export * from "./account-actions";
export * from "./app-shell";
export * from "./brand-logo";
export * from "./breadcrumb";
export * from "./confirm-dialog";
export * from "./empty-state";
export * from "./error-message";
export * from "./error-summary";
export * from "./field";
export * from "./fixture-notice";
export * from "./footer";
export * from "./gate-notice";
export * from "./inline-error";
export * from "./input-format";
export * from "./intl-scope";
export * from "./loading-skeleton";
export * from "./locale-switcher";
export * from "./nav-match";
export * from "./notice";
export * from "./offline-banner";
export * from "./otp-input";
export * from "./page-header";
export * from "./phone-input";
export * from "./public-header";
export * from "./public-header-with-account";
export * from "./retry-action";
export * from "./role-nav";
export * from "./search-combobox";
export * from "./search-combobox-logic";
export * from "./section-heading";
export * from "./service-icon";
export * from "./session-seam";
export * from "./skip-link";
export * from "./status";
export * from "./status-badge";
export * from "./stepper";
export * from "./view-state";
export * from "./view-state-fallback";

// Payments, support and notifications (FE phase 2)
export * from "../payments/cancellation-dialog";
export * from "../payments/document-link";
export * from "../payments/money";
export * from "../payments/payment-status";
export * from "../payments/payment-summary";
export * from "../support/support-ticket-form";
export * from "../support/ticket";
export * from "../support/ticket-timeline";
export * from "../notifications/notification-list";
export * from "../notifications/notifications";
