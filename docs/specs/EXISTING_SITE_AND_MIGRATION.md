# Existing Site, New Domain and Migration

## Grounded vs unverified

Prior public website discussion identified `https://curevist.in/` as the existing brand site, primarily doctor home visits and mention of labs, with privacy policy reference to GCP/Firebase infrastructure. **Public website disclosures are not proof of implemented features, internal framework or real user counts.** The source code, Auth, Firebase data, payments, hosting and schema are unknown without authorized access. `surecurevisit.in` is a newly purchased GoDaddy domain. Do not associate SureCure Visit with any unconfirmed business entity.

## Proposed migration process (not executed)

1. Client grants authorized read-only access to existing source, package manifest, Firebase Auth, Firestore/Realtime Database and Storage inventory, indexes/rules, active users and integrations; no clinical records shared in AI chats.
2. Secure backup/exports and document data processing/consent/retention requirements.
3. Schema map old user/doctor/payment/booking IDs to new UUIDs and immutable public references; evaluate provider verification reliability.
4. Prototype migration with **synthetic** samples, then private staging with properly authorized deidentified/restricted data as approved.
5. Test counts, relationships, timezones, missing fields, document metadata, access policy and error logs; identify data needing manual review.
6. Understand credential migration constraints; password hashes not automatically portable; plan secure reset/re-auth if required.
7. Keep old site active until new application passes client acceptance and compliance gates. Coordinate DNS/redirect/cutover and rollback with client. Never delete old data merely because new website looks done.

## No false assumptions

No claims of old customer count, migration readiness, current frontend framework or live payment state without repo/database evidence. New project documents are planning artifacts; migration has not started.
