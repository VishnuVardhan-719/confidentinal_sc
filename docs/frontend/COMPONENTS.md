# Shared UI components (fe2-a)

Import everything from `@/components/shared` (barrel). Primitives live in `@/components/ui/*`.
All strings come from next-intl; components never render raw server text, raw keys or raw errors.
Only `common`, `errors` and `accessibility` messages reach the browser globally. A client island that needs
`payment` or `support` strings must sit inside `<IntlScope namespaces={["payment"]}>` (server component).

## Data state

| Export | Props / signature | Notes |
|---|---|---|
| `ViewState<T>` | `{kind:"loading"} \| {kind:"error"; code?} \| {kind:"gated"; feature?} \| {kind:"ready"; data}` | Uniform load state for data components |
| `viewFromResult(result, feature?)` | `ApiResult<T> -> ViewState<T>` | `gated` errors become the gated state |
| `ViewStateFallback` | `{ view, children: (data) => ReactNode, loadingVariant? }` | Skeleton / InlineError + retry / GateNotice |
| `IntlScope` | `{ namespaces: Namespace[]; children }` | Server; adds namespaces for client islands below |

## Status

| Export | Props | Notes |
|---|---|---|
| `STATUS_TONES` | `neutral, info, progress, success, warning, danger, brand` | Agreed vocabulary (XREVIEW-b X1). `brand` is not a verification signal |
| `StatusPresentation` | `{ labelKey: string; tone: string; icon? }` | What module status maps return (`labelKey` = full key, e.g. `payment.status.due`) |
| `toStatusDescriptor(p, t)` | presentation + root translator -> `{tone,label,icon}` | Unknown tone -> neutral; missing key -> `common.status.unknown` |
| `StatusBadge` | `{ tone, label, icon?, className? }` | Text + icon + colour. `brand` defaults to a dot; pass `icon:"shield"` only for server-verified states |
| `KeyedStatusBadge` | `{ presentation, className? }` | Server components (needs all namespaces) |
| `resolveStatus(map, status, fallback)` | canonical map lookup | Unknown -> neutral |

## Payments (`src/components/payments`)

| Export | Props | Behaviour |
|---|---|---|
| `PaymentSummary` | `{ view: ViewState<PaymentSummaryView>, headingLevel? }` | Server. `PaymentSummaryView = { statusPresentation, lines?: {label, amountPaise}[], amountDuePaise, collectedPaise, refundedPaise, method: "pay_after"\|"online_test"\|null, synthetic }`. Collected = server-recorded only; pay-after explained as not an online payment; invalid paise -> "Amount unavailable"; `synthetic` -> FixtureNotice |
| `PaymentStatus` | `{ presentation }` | Server. Pass `paymentStatusPresentation(status)` from the payments module. Separate from the booking badge |
| `InvoiceLink`, `ReceiptLink` | `{ doc: { state: "available"\|"pending"\|"not_issued"\|"expired"\|"unavailable"; href?; issuer?: "platform"\|"provider" } }` | Server. Links only when `available` and the URL is internal or credential-free https; opens with `noreferrer` |
| `CancellationDialog` | `{ policy: CancellationPolicyView; onConfirm({reason, policyVersion}) => Promise<ConfirmResult>; trigger? }` | Client, needs `IntlScope ["payment"]`. `policy = {state:"approved", version, summary, feePaise, refundPaise\|null} \| {state:"unavailable"}`. Fails closed without approved terms; needs reason + acknowledgement; closes only after server success |
| `formatPaise(paise, locale)`, `isValidPaise`, `isSafeDocumentHref` | helpers | INR, Indian grouping, Latin digits; null for invalid amounts |

## Support (`src/components/support`)

| Export | Props | Behaviour |
|---|---|---|
| `SupportTicketForm` | `{ bookings?: {id,label}[]; defaultBookingId?; onSubmit(input) => Promise<ApiResult<{reference: string\|null}>> }` | Client, needs `IntlScope ["support"]`. Categories service/payment/account/access, description <= 1000, no health/attachment fields, soft warning for OTP/Aadhaar-like numbers, ErrorSummary, server reference shown on success |
| `TicketTimeline` | `{ view: ViewState<TicketEventView[]> }` | Server. Events `{id, kind: created\|status_changed\|message\|escalated, actor: you\|provider\|platform, at, message?, statusPresentation?}`, oldest first, IST, plain text only |
| `validateTicket`, `looksSensitive` | helpers | Mirror the support module bounds |

## Notifications (`src/components/notifications`)

| Export | Props | Behaviour |
|---|---|---|
| `NotificationList` | `{ view: ViewState<NotificationView[]>; onMarkRead?(id) => Promise<{ok:true}\|{ok:false; code?}> }` | Client, strings in `common` (no scope needed). Kind + time only (no PHI); unknown kinds -> "You have an update"; optimistic mark-read with rollback; only internal `href`s are linked |

## Navigation and account

| Export | Props | Behaviour |
|---|---|---|
| `PublicHeaderWithAccount` | none | Server. Suspense around the session read; use in public layouts |
| `PublicHeader` | `{ account?: PublicAccount \| null }` | `undefined` = loading (space reserved), `null` = signed out (Sign in with safe `next`, Create account), object = role dashboards + POST sign-out |
| `AccountActions` | `{ account, variant: "desktop"\|"mobile" }` | Also usable in AppShell `topbarActions` |
| `PublicAccount`, `getPublicAccount()` | session seam | Returns null until the auth module is wired (REQUESTS R-FE01-6) |
| `ROLE_NAV`, `ROLES`, `roleNavHref`, `roleDashboardHref` | config | Per-role items for `AppShell nav`; labels `common.roleNav.<key>` |
| `safeReturnPath`, `loginHref(path)` | helpers | Internal path only, query/hash dropped, no `//`, encoded slashes or control chars |
| `AppShell` | `{ workspaceLabel, nav: ShellNavItem[], topbarTitle?, topbarActions?, sidebarFooter?, children }` | `count` must be server-derived; announced as "n unread" |

## Search

| Export | Props | Behaviour |
|---|---|---|
| `SearchCombobox` | `{ name?="q", labels, defaultValue?, minChars?=2, debounceMs?=250, loadSuggestions?(q, signal) => Promise<ApiResult<SuggestionGroup[]>>, onSelect?, className?, inputClassName? }` | ARIA 1.2 combobox after hydration (plain search input without JS or without a source). Grouped options, Arrow/Enter/Escape, stale-request cancellation, loading/empty/error/gated states in a live region. Choosing an option with an internal `href` navigates |
| `Suggestion`, `SuggestionGroup` | `{id,label,description?,href?,value?}`, `{id,label,items}` | Group ids: specialities, symptoms, doctors, clinics |
| `DoctorSearch` (`@/components/public/doctor-search`) | `{ labels }` | Landing hero form: location (city/PIN) + combobox; URL contract `/doctors?q=&pin=\|city=` (REQUESTS R-FE01-7) |

## Forms and feedback (phase 1, updated)

`Field`, `FormSection`, `ErrorSummary` (unique ids), `Stepper` (labelled group, not a nav landmark), `PhoneInput`
(visible and announced +91; over-long input is kept so validation rejects it), `OTPInput`, `ConfirmDialog`
(`children`, `confirmDisabled`, `onOpenChange`; Cancel clears stale errors), `GateNotice` (`feature` flag or
`reason="contract_pending"`), `InlineError`, `RetryAction`, `OfflineBanner`, `FixtureNotice`, `EmptyState`,
`LoadingSkeleton`, `PageHeader`, `Breadcrumb`, `SectionHeading`.
