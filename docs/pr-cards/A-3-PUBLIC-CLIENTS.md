# A-3 native public-client OAuth lifecycle

Owner directive 2026-10-21; existing A-3 authorization lifecycle and CAP-3 authority ownership.
No claim of completing original CAP-3 or independent customer login from this correction.

Frozen outcome: explicit public clients can register without a fictitious shared secret, complete
owner-consented S256 authorization, redeem only their own code and rotate/revoke only their own
refresh grant. Preserve original org/project/mode/profile/listing; no default permission widening.
Existing confidential client_secret_post registrations and legacy hashed records keep working.

Implementation seams: core/oauth-handlers.js, db.js JSON client data, fake-db, OAuth unit and
real disposable PostgreSQL tests. Unsupported authentication methods fail before persisting.
Public requests with supplied secrets/header auth fail; confidential records cannot downgrade.
Resource, redirect, PKCE, replay, revoked credentials and wrong-client negatives remain enforced.

Required source proof: full check/unit and disposable DB + RTC CI at exact head; self-review.
Required external proof remains OPEN: released native desktop/mobile clients, provider-account
reads/negative cases and full multi-principal enrollment. No production migration/release or real
provider operation is authorized. Public DCR grants no account access without independent consent.

References: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
and existing docs/HUB-COMPATIBILITY.md, reviewed Hub spec, service-owned direct OAuth only.
