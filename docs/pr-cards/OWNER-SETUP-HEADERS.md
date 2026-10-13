# Owner setup browser-header repair

Owner reports `invalid_origin` during genuine manual setup after the authorized
layout deployment. The configured public origin matches the public alias.

Root cause: `Referrer-Policy: no-referrer` sets HTML form POST Origin to null.
Use `strict-origin` to preserve HTTPS form Origin without leaking path/query
information. Keep the exact-origin comparison and reject null/missing/foreign
origins. The existing CSP also blocks the inline stylesheet added in #106;
allow only its SHA-256 hash, keeping scripts, external assets, frames and base
URL overrides blocked. Do not use unsafe-inline or widen accepted origins.

Acceptance: focused response/header and positive/negative auth regression;
full local check/unit suite; exact-head CI/release-policy and review before
merge. Owner's immediately preceding deployment approval covers finishing
this same setup/layout recovery; record exact released revision independently.
Actual owner enrollment remains pending; fake-provider tests are not browser
or genuine provider acceptance. No production operations or key scope widened.

Resume: implement header fix, validate, publish PR, verify exact-head/main gates,
deploy corrected setup under the existing owner instruction, then ask owner
to refresh and repeat secure enrollment without exposing secrets in chat.

Reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header
