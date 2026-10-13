# Owner key enrollment diagnostics

Owner reports failed Appliance Desk project-key enrollment after revoking both
earlier stored keys. Read-only database inspection confirms both old rows are
revoked and no replacement was stored. Duplicate active rows are not the sole
explanation. Do not guess the next cause or request new raw keys in chat.

Scope: allowlisted KeySetupError codes for input/encryption, authentication,
project/org verification and storage. Show a bounded numeric provider HTTP
status when available. Never display raw provider/driver messages, objects,
credential values or request payloads; arbitrary exceptions remain generic.
Keep all admission probes, encrypted storage, authentication/lockout, project
scope, production controls and operation routing unchanged.

Acceptance: realistic denied fake-provider authentication, encryption refusal
before calls, replace-after-revoke, duplicate/general database failures, and
HTML diagnostic redaction. Full check/unit and exact PR/main CI gates required.
No tests use real credentials; source/tests do not prove owner enrollment.

Resume: validate and merge under normal reviewed gates; deploy the diagnostic
correction as part of the explicitly approved immediate setup recovery. Owner
then retries once and reports only the safe code, enabling a targeted remedy.
Do not reinterpret the diagnostic release as production or credential widening.
