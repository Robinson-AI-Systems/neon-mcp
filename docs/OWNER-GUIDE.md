# Owner guide — what you can ask for

Plain-English things to say to Claude once each part is built. Each line names the batch that delivers it; until then
it does not work yet. This file is updated as features ship.

| Say something like… | What happens | Batch |
|---|---|---|
| "Who am I connected to in Neon?" | Organization, key kind (last 4 only), preview or production mode, your spend caps | A/B |
| "Show me my Appliance Desk database." | Project, branches (which ones are production), computes and sizes, databases, storage, recent activity | D |
| "How many customers signed up this week?" | A read-only query, at most 200 rows, never changes anything (if you allow production reads, IN-09) | D |
| "Delete the test rows from the demo table on the dev branch." | Shows exactly how many rows, asks when it is risky, does it, confirms | D |
| "Run this change on production." | Refused until you turn production access on. Then: tries it on a throwaway copy first, tells you exactly what will change, asks you, applies it all-or-nothing, keeps an undo | B/D |
| "Make my compute bigger." | Shows what it could add to your monthly bill in dollars, asks you, changes it, confirms | B/D |
| "Get back the data from Tuesday." | Restores Tuesday's state to a separate branch, shows what's different, and only with your OK copies rows back or swaps it in | W |
| "Take a backup before this migration." | A named snapshot you can restore from | D/W |
| "Give me a throwaway database for this feature." | A branch that deletes itself after a day, with realistic test data if you want it | V |
| "Try this migration first." | Runs it on a copy and shows the schema changes, errors and anything that would lock a big table — production untouched | V/W |
| "Clean up everything from that test run." | Removes exactly what that run created, nothing else | V |
| "Why is this query slow?" | Tests indexes on a copy and shows before/after timings and the exact fix | V |
| "What is Neon costing me this month?" | Month so far, projected total, by project and branch, and what to change to save money | O/W |
| "Review my Neon account." | Members, keys and their ages, protected branches, usage and bill estimate, security, settings — ok or needs attention | O |
| "Add Sam to my Neon organization." | Shows the email and role, asks you, sends Neon's invitation | O |
| "Change my Neon plan." / "Turn on SSO." | Neon has no way to do these by API, so you get exact steps (or a browser walk-through), then it checks the result where it can. It never buys anything | O |
| "Clean up old branches." | Lists stale branches (never production or the app's), asks you, deletes them (recoverable for 7 days) | W |
| "Rotate the database password for Appliance Desk." | New password shown once on your setup page, the list of places to update, then checks it works | W |
| "Is Neon ready for Appliance Desk?" | Every item the app needs: done, fixed with your OK, or exactly what you need to click | P |
| "Set up Neon for my new project." | Project, databases, roles, protection, dev-branch defaults — previewed first; connection details only on your setup page | P |
| "What changed in Neon through Claude this week?" | The change log | B |
| "Undo that." | Reverses the last change when it has a clean opposite (including a SQL change, by rolling the branch back to just before it while keeping today's state on the side); says plainly when it can't | X |
| "Make a 24-hour read-only pass for Codex." | A pass shown once on your setup page; the agent uses it through Robinson's Toolkit (`rtool`) or the HTTPS API | R |
| Anything else in Neon | The universal tools find the right Neon operation and run it with the same safety | U |

## Reading large results

When a read result is too large for the default 8KB response, retain the returned `res_...` handle. Call `neon_get_result` with that handle and `page: 0`, following `nextPage`. Each handle expires after 24 hours and only the same scoped connection can read it. Oversized items may use base64 JSON fragments: decode and concatenate fragments in page order, then parse the JSON. No Neon production access is enabled by this feature.
