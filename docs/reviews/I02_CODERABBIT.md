# CodeRabbit review: owner-lineage I02 (2026-11-17)

Scope: commit 5097170 against develop ce23f63. Result: 3 findings. To be fixed in the adopted lineage (see `docs/LINEAGE_COMPARISON.md`).

| Severity | Finding | Disposition |
|---|---|---|
| Major (CWE-863) | Storage SELECT policy checks the document ticket only at sign time; `createSignedUrl(path, 86400)` outlives the 60 s ticket and is not re-checked at read. | Keep the friend's signing ban (F-2:304-309); use a server-side signer or read proxy with a fixed expiry. |
| Minor | `register` replay compares only some arguments; a different `p_expires_on`, `p_issued_on` or `p_label` returns the original document. | Compare all nullable arguments with IS DISTINCT FROM; raise 23505 on mismatch. |
| Minor | `lpad(counter::text, 6, '0')` truncates above 999999 and collides. | Use a width that cannot truncate, or fail loudly. |
