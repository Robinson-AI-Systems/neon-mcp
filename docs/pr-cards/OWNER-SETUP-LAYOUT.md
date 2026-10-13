# Owner setup layout repair

Owner request: the Add scoped key form is unreadable during secure enrollment.

Scope: `api/neon/setup.js` HTML presentation only. Stack each labeled field,
add plain-language names and inline guidance, provide responsive spacing and
visible keyboard focus, and distinguish provider API key from administrator
passphrase. Keep POST field names/actions, secret input types, encryption,
origin checks, lockout, project-only scope and production gates unchanged.

Acceptance:
- Guided credential fields render in the correct order with no secret prefill.
- Existing setup authorization, scope and secret-redaction tests pass.
- Repository checks and full unit suite pass; exact-head application CI and
  release-policy must pass before merge.
- Source/automated evidence does not establish deployed or real enrollment.
- Existing scheduled release applies unless the owner explicitly approves an
  emergency release after the reviewed change is ready.

Resume: source implementation and focused regression added; run validation,
publish reviewed PR, inspect exact-head CI and reviews, merge only when green.
Real owner enrollment remains pending; do not duplicate keys or bypass browser
policy restrictions. No production access or provider mutation is authorized here.
