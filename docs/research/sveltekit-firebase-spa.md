# Research: wiring SvelteKit 3 SPA mode to Firebase Auth, Firestore, and the Emulator Suite

Ticket: [#2](https://github.com/CMH7/Perancial/issues/2) (child of [#1](https://github.com/CMH7/Perancial/issues/1)).
Researched 2026-11-09 against primary sources. Versions checked on npm that day:

| Package | Latest |
| --- | --- |
| `@sveltejs/kit` | 3.1.1 (repo already on `^3.0.0`) |
| `@sveltejs/adapter-static` | 4.0.1 (peer: `@sveltejs/kit ^3`) |
| `firebase` (JS SDK) | 13.2.0 (released 2026-10-30) |
| `firebase-tools` (CLI) | 15.35.0 (Node `>=20`) |

## TL;DR

1. **Config lives in `vite.config.ts` now.** SvelteKit 3 dropped `svelte.config.js`; pass `adapter: adapter({ fallback: '200.html' })` to the `sveltekit()` plugin. Swap `adapter-auto` for `adapter-static`.
2. **`export const ssr = false` in `src/routes/+layout.ts`.** That turns the whole app into an SPA. The build emits a single `200.html` shell. Don't name it `index.html`.
3. **Don't use `$env/static/public`.** It's deprecated in SvelteKit 3 and will be removed in 4. Declare the Firebase config in `src/env.ts` with `defineEnvVars({ ... { public: true, static: true } })` and import it from `$app/env/public`. The Firebase web config isn't a secret.
4. **Firestore offline cache:** `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`. Skip the persistent cache when you're on the emulator.
5. **Auth gating:** gate in the root `+layout.ts` `load` with `await auth.authStateReady()`. Redirect to `/login` if there's no user. Also keep an `onAuthStateChanged` listener running for sign-out.
6. **Google sign-in:** use `signInWithPopup`. If you want redirect (better on mobile), set `authDomain` to the domain the app is served from (for example `<project>.web.app`). Otherwise third-party storage blocking in Chrome, Firefox, and Safari breaks it.
7. **Rules:** `rules_version = '2'`, put every document under `users/{uid}/...`, and allow only `request.auth.uid == uid`. Also check the owner UID itself, so a second Google account can't create its own silo.
8. **Hosting:** set `public: "build"` and rewrite `**` to `/200.html`. Static files always win over rewrites.
9. **Emulators:** the CLI now needs **Java 21+** (the docs page still says 11). Use a `demo-` project ID for local work so nothing touches a real project.

---

## 1. SvelteKit 3 SPA mode

### Config location changed in v3

> "Prior to SvelteKit 3, config lived in a svelte.config.js file, which is no longer supported."
> ([adapter-static docs](https://svelte.dev/docs/kit/adapter-static), [migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3))

The repo's `vite.config.ts` already passes `adapter: adapter()` into `sveltekit({...})`. Only the import and options need to change:

```ts
// vite.config.ts
import adapter from '@sveltejs/adapter-static';
// ...
sveltekit({
  compilerOptions: { /* existing runes setting */ },
  adapter: adapter({ fallback: '200.html' }) // pages/assets default to 'build'
})
```

The [SPA docs](https://svelte.dev/docs/kit/single-page-apps) say:

- Add `export const ssr = false;` to the root layout (`src/routes/+layout.ts`). That's what puts every route in SPA mode.
- Set `fallback` to the name your host expects. Avoid `index.html` because it "may conflict with prerendering." Firebase Hosting can rewrite to any filename, so `200.html` is fine.
- The fallback page always uses absolute asset paths.
- adapter-static's `strict` check passes because a `fallback` is set. No route needs `prerender = true`.

`trailingSlash` doesn't matter here. That note only applies to prerendered pages, and we have none.

The SvelteKit docs warn that SPA mode hurts SEO and first paint. That doesn't matter for a single-user, sign-in-gated finance app.

### Other v3 changes that will come up

From the [migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3):

- `$app/stores` is **removed**. Use `$app/state` (`page`, `navigating`, `updated`) without the `$` prefix.
- `$app/environment` is renamed to `$app/env`. `browser`, `dev`, and `building` live there now.
- `goto(..., { replaceState })` is now `replace`. `invalidateAll` is deprecated in favour of `refreshAll`.
- `goto` now rejects for URLs that don't resolve to a route in the app. Use `window.location.href` for external URLs.
- Minimum Node is v22.17.

## 2. Environment variables (pitfall: `$env/static/public` is deprecated)

The `$env/static/public` page says it's "deprecated in SvelteKit 3 in favour of explicit environment variables" and "will be removed in SvelteKit 4" ([source](https://svelte.dev/docs/kit/$env-static-public)).

The replacement ([environment variables docs](https://svelte.dev/docs/kit/environment-variables)) works like this:

- Declare variables in `src/env.ts`.
- They're private by default. Add `public: true` to expose one through `$app/env/public`.
- Add `static: true` to inline the value at build time.
- Values load from `.env` / `.env.local`. There is no `PUBLIC_` prefix rule any more.

```ts
// src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env';

const pub = { public: true, static: true } as const;
export const variables = defineEnvVars({
  FIREBASE_API_KEY: pub,
  FIREBASE_AUTH_DOMAIN: pub,
  FIREBASE_PROJECT_ID: pub,
  FIREBASE_APP_ID: pub,
  FIREBASE_USE_EMULATORS: { ...pub, schema: (v) => v === 'true' }
  // storageBucket / messagingSenderId only if those products are used
});
```

```ts
import { FIREBASE_API_KEY /* ... */ } from '$app/env/public';
```

**Why `static: true`:** we have no server. SvelteKit 3.1.1 handles dynamic public variables in a static build by writing `_app/env.js` at build time (`node_modules/@sveltejs/kit/src/core/postbuild/prerender.js`). That still bakes the values in at build time and costs an extra request, so static inlining is simpler. *Inference from source. The docs don't cover adapter-static explicitly.*

**Is it OK to ship the Firebase config?** Yes. Firebase says: "API keys for Firebase services are OK to include in code or checked-in config files." Firestore data is protected by Security Rules, not by keeping the key secret. Keep the key restricted to Firebase APIs, which is the default ([source](https://firebase.google.com/docs/projects/api-keys)). App Check is optional hardening.

## 3. Firebase module layout

The root layout has `ssr = false`, so no route code runs on the server. The SDK still has to be imported lazily from client-only code. Don't import it from `hooks.server`, `+*.server.ts`, or `src/env.ts`.

Proposed layout:

```
src/
  env.ts                     # defineEnvVars (public + static Firebase config)
  lib/firebase/
    app.ts                   # initializeApp + emulator wiring; exports app, auth, db
    auth.ts                  # signIn (Google popup), signOut, currentUser helpers
    owner.ts                 # OWNER_UID guard (see section 6)
  routes/
    +layout.ts               # export const ssr = false; auth-gating load()
    +layout.svelte
    login/+page.svelte       # "Sign in with Google" button
    (app)/...                # all gated routes
firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
```

```ts
// src/lib/firebase/app.ts (sketch)
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator,
  persistentLocalCache, persistentMultipleTabManager, memoryLocalCache
} from 'firebase/firestore';
import * as env from '$app/env/public';

export const app = initializeApp({
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  appId: env.FIREBASE_APP_ID
});

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: env.FIREBASE_USE_EMULATORS
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

if (env.FIREBASE_USE_EMULATORS) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
```

## 4. Firestore offline persistence (current modular API)

From the [offline docs](https://firebase.google.com/docs/firestore/manage-data/enable-offline):

- "For the web, offline persistence is disabled by default." You opt in through `initializeFirestore` settings.
- Use `persistentLocalCache` for the cache. Add `persistentMultipleTabManager()` so several open tabs share it. Without a tab manager you get single-tab persistence.
- The default cache threshold is 100 MB. `CACHE_SIZE_UNLIMITED` disables cleanup.
- The cache "isn't automatically cleared between sessions." On a shared device the finance data stays in IndexedDB after sign-out. To wipe it, call `terminate(db)` then `clearIndexedDbPersistence(db)` on sign-out.
- Concurrent offline edits to the same document resolve as **last write wins**. That matters for any denormalised running balances. Prefer deriving balances from entries over storing mutable totals.
- Offline queries only see cached documents.

The old `enableIndexedDbPersistence()` style is legacy. Use the `localCache` setting. Neither SDK 12 nor 13 lists Auth or Firestore breaking changes in its [release notes](https://firebase.google.com/support/release-notes/js). The 13.0.0 breaking changes were all in AI Logic.

## 5. Auth: Google sign-in and gating every route

**Gating.** `currentUser` may be `null` "because the auth object has not finished initializing" ([manage users](https://firebase.google.com/docs/auth/web/manage-users)). `auth.authStateReady()` "returns a promise that resolves immediately when the initial auth state is settled" ([Auth reference](https://firebase.google.com/docs/reference/js/auth.auth)). Use it in the root universal load, which only runs in the browser because `ssr = false`:

```ts
// src/routes/+layout.ts
import { redirect } from '@sveltejs/kit';
export const ssr = false;

export async function load({ url }) {
  const { auth } = await import('$lib/firebase/app');
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user && url.pathname !== '/login') redirect(307, '/login');
  if (user && url.pathname === '/login') redirect(307, '/');
  return { uid: user?.uid ?? null };
}
```

Mid-session sign-out or token revocation doesn't re-run `load`. Keep an `onAuthStateChanged` listener in `+layout.svelte` that calls `goto('/login')` when `user` becomes null.

**Popup vs redirect.** The [Google sign-in docs](https://firebase.google.com/docs/auth/web/google-signin) show both flows and say "The redirect method is preferred on mobile devices." However, `signInWithRedirect` breaks under third-party storage blocking. The [redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices) list Chrome M115+, Firefox 109+, and Safari 16.1+ as affected.

- If the app is served from `<project>.firebaseapp.com`, nothing needs to change.
- If it's served from `<project>.web.app` or a custom domain, use option 1. Set `authDomain` to the serving domain, add `https://<domain>/__/auth/handler` as an authorized redirect URI on the OAuth client, and add the domain to Auth's authorized domains. Firebase Hosting already serves `/__/auth/*` on every hosting domain.
- `signInWithPopup` avoids all of this. It's the simplest default, and redirect can be added later for mobile.

**Emulator.** For popup and redirect flows, the Auth emulator "serves a local version of the corresponding sign-in page." It creates mock accounts, so no real Google account is needed ([connect_auth](https://firebase.google.com/docs/emulator-suite/connect_auth)). Emulator ID tokens are unsigned and production rejects them.

## 6. Security rules: one owner UID

Key facts from [rules basics](https://firebase.google.com/docs/rules/basics) and [rules-query](https://firebase.google.com/docs/firestore/security/rules-query):

- Locked mode denies everything by default.
- The content-owner pattern is `request.auth.uid == userId` on a path segment.
- `rules_version = '2';` must be the first line for recursive wildcards and collection-group queries.
- "security rules are not filters---queries are all or nothing." Every query must be scoped under the user's own path.

**Important for a single-user app:** "Owner-only" in the per-user pattern means *each* signed-in user owns their own subtree. If Google sign-in is enabled, any Google account can sign in and create a `users/<their uid>` silo. That wouldn't leak the owner's data, but it does let strangers use the project's Firestore quota. Pin the rules to the one owner UID as well:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(uid) {
      return request.auth != null
        && request.auth.uid == uid
        && request.auth.uid == 'OWNER_UID_HERE';
    }
    match /users/{uid}/{document=**} {
      allow read, write: if isOwner(uid);
    }
    // everything else falls through to deny
  }
}
```

Optionally, block every other account at sign-in too. Check `user.uid` against a public `OWNER_UID` env var in the client and sign out on mismatch. That's only UX. The rules are the real enforcement. A stronger alternative is an Identity Platform blocking function, but that needs Cloud Functions, so it's out of scope given "no server code".

The OWNER_UID literal differs between the emulator (mock account UIDs) and production. Keep `firestore.rules` checked in with the production UID, and use per-UID test data or `request.auth.token.email` in the emulator. This is a small open decision for the rules ticket.

**Data shape consequence:** every collection lives under `users/{uid}/...`, for example `users/{uid}/accounts/{id}`, `users/{uid}/transactions/{id}`. Store amounts as integer centavos (Firestore integers are 64-bit, which is plenty). Don't create top-level collections, or the rule above won't cover them.

## 7. Emulator Suite

- **Java 21 or newer is required.** The [install docs](https://firebase.google.com/docs/emulator-suite/install_and_configure) still say "JDK version 11 or higher," but firebase-tools source has `MIN_SUPPORTED_JAVA_MAJOR_VERSION = 21` ([commandUtils.ts](https://github.com/firebase/firebase-tools/blob/master/src/emulator/commandUtils.ts)).
- Run `firebase init emulators` and pick Auth and Firestore (plus Hosting if wanted). Default ports: Auth 9099, Firestore 8080, UI 4000, Hosting 5000.
- **Use a `demo-` project ID** (for example `demo-perancial`) for local dev. firebase-tools treats the `demo-` prefix as a fake project ([constants.ts](https://github.com/firebase/firebase-tools/blob/master/src/emulator/constants.ts) `FAKE_PROJECT_ID_PREFIX = "demo-"`). No real credentials or resources are needed.
- Emulator data is wiped on shutdown. Persist it with `firebase emulators:start --import=./emulator-data --export-on-exit` ([connect_firestore](https://firebase.google.com/docs/emulator-suite/connect_firestore)).
- The SDK cache can drift from the emulated database, so the docs suggest disabling local persistence against the emulator. That's what the `memoryLocalCache()` branch in section 3 does.
- Run `vite dev` alongside `firebase emulators:start --only auth,firestore`. The emulator hot-reloads `firestore.rules`.

## 8. Deploy to Firebase Hosting

From the [Hosting full config](https://firebase.google.com/docs/hosting/full-config): "Firebase Hosting only applies a rewrite rule if a file or directory does not exist." Hashed assets under `_app/immutable` are served directly. Every other path falls through to the SPA shell.

```json
{
  "hosting": {
    "public": "build",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/200.html" }],
    "headers": [
      { "source": "/_app/immutable/**",
        "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
    ]
  },
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": { "auth": { "port": 9099 }, "firestore": { "port": 8080 }, "ui": { "enabled": true } }
}
```

Deploy with `bun run build && firebase deploy --only hosting,firestore`.

Don't cache `200.html` long-term. The header above only targets fingerprinted assets.

SvelteKit 3's `updated.current` now polls for new versions hourly by default. That's harmless, but it means `_app/version.json` gets requested.

## Open questions for sibling tickets

- **OWNER_UID in rules vs emulator**: hard-code the UID, check by email, or generate rules at deploy time?
- **Sign-out on shared devices**: clear the IndexedDB cache every time, or offer a "trusted device" toggle?
- **Balances**: offline last-write-wins argues for deriving balances from transactions rather than storing a mutable running total.
