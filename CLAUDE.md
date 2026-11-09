# Perancial

Single-user personal finance app (SvelteKit 3, Svelte 5, Tailwind 4, TypeScript, bun, Firebase). Domain vocabulary lives in `GLOSSARY.md`; use its terms.

## Issue tracking

- Issues live on GitHub: `CMH7/Perancial`. Use `gh`.
- **One milestone per module.** Every module gets a GitHub milestone with the same name as the module (e.g. "Chart of Accounts", "Transactions"). Create it when the module's first issue is created.
- **Every issue goes in its module's milestone**: wayfinder maps and tickets, implementation issues, and bugs. The milestone's percentage is how module progress is tracked.
- Wayfinder maps carry the `wayfinder:map` label; their tickets are sub-issues with `wayfinder:<type>` labels and native blocking.

## Safety

The repo is public. Never commit real financial data or service-account keys. Firestore security rules must restrict all data to the owner's UID.
