# Content: CMS and public stories/FAQ

Module `src/modules/content`. Admin pages `src/app/[locale]/admin/cms/**`. Public pages `src/app/[locale]/(public)/stories/**`, plus FAQ data for `(public)/faq`. Updated 2026-11-20 (R9-E3).

## Model

- Entry kinds are `story`, `faq` and `page`. Each entry has one version per locale (`en`, `te`, `hi`), and each version has its own workflow state.
- Workflow (`rules.ts` `TRANSITIONS`):
  - `submit_preview`: `draft` to `in_preview`
  - `return_to_draft`: `in_preview` to `draft`
  - `publish`: `in_preview` to `published`
  - `archive`: `published` to `archived`
- Editing and preview need the `content:edit` capability. Publish and archive need `content:publish` (`contentCapabilityFor`). These capabilities are frontend proposals (REQUESTS R-E04).
- Consent gate (R-E14, needs product confirmation): a story publishes only with `consentEvidenceId`, or with the attestation `noIdentifiablePerson: true`. FAQ entries and pages are not gated. `availableContentActions` hides Publish when the gate fails, and the fixture adapter rejects the publish too.
- Public readers get the published snapshot only. A newer draft never changes the live story (covered by e2e).

## Safe content

- `schema.ts` accepts plain text and a structured rich-text subset: paragraph, heading 2/3, bullet and ordered list, bold, italic, and safe links (internal locale paths or https). Raw HTML, script, event handlers, entity-encoded markup and unsafe URLs are rejected with field errors.
- The editor (`editor.ts`) is a textarea with a small markup subset that maps one to one onto those nodes (`## heading`, `- item`, `**bold**`, `[label](/en/path)`). It never produces HTML.
- `src/components/content/rich-text.tsx` renders the nodes as React elements. Nothing uses `dangerouslySetInnerHTML`.

## Public site

- Server helper `src/modules/content/public.ts` provides `getPublishedStories(locale)`, `getPublishedStory(slug, locale)` and `getPublishedFaq(locale)`. Results are `ok`, `empty`, `not_found`, `gated` or `unavailable`, and `fixture: true` means synthetic data.
- Pages read through `src/components/public/stories-source.ts`.
- Behaviour by adapter mode:

| Mode | `/stories` | `/stories/<slug>` | FAQ |
|---|---|---|---|
| fixture | published fixture stories with `FixtureNotice` | story, or a real HTTP 404 for unknown or unpublished slugs | published fixture FAQ |
| http (no CMS contract yet, `gated`) | "Stories are not available yet", HTTP 200 | same gated state, HTTP 200 (the URL may become valid later) | empty state |

- The HTTP 404 for an unknown slug comes from `src/proxy.ts`, which calls `getPublishedStory` before rendering. A gated backend is never treated as not found.
- The fixture store lives on `globalThis`, so the proxy (a separate bundle in the same process) sees what the admin published.

## Tests

- Unit: `tests/unit/modules-operations/content.test.ts`, `cms-editor.test.ts`, `content-audit-branches.test.ts`, `stories-gated.test.ts`.
- E2E: `tests/e2e/cms.spec.ts` (list, rejection of script and HTML, editor versus publisher, publish updates the public FAQ, a draft does not change the live story, non-content admins denied). `public.spec.ts` covers the unpublished-story 404, and `a11y-sweep-e.spec.ts` covers axe and overflow at 390 and 1280.

## Open

- There is no CMS or public content contract in `docs/API_CONTRACTS.md` (R-E07), so http mode is gated everywhere.
- The consent policy needs confirmation, and the backend must enforce the same gate (R-E14).
- The `content:*` capabilities need a backend migration (R-E04).
- Telugu and Hindi strings are unreviewed.
