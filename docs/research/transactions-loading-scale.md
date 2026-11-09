# Research: loading as history grows

Issue: [#37](https://github.com/CMH7/Perancial/issues/37). Researched 2026-11-10 against Firebase JS SDK `firebase@13.2.0` / `@firebase/firestore@4.19.1` (the installed versions).

## Question

`subscribeLedger` (`src/lib/firebase/ledger.ts`) keeps `onSnapshot` listeners on the owner's whole `accounts` and `transactions` collections, with `persistentLocalCache` + `persistentMultipleTabManager` (`src/lib/firebase/app.ts`). `buildChart` (`src/lib/domain/chart.ts`) computes every Balance from all Transactions. Expected volume is about 3-5k Transactions a year. How do read billing, cache size and startup time behave as that grows, and at what point do we need date windows, paging or stored totals?

## Short answer

- **Reads, not the cache, are the first limit.** A listener that has been disconnected for **more than 30 minutes** is billed as a brand-new query, even with the persistent cache. Closing the app counts as a disconnect. So almost every app open after a break re-bills **every Transaction**. A reload or reconnect within 30 minutes only bills the documents that changed.
- On the free Spark plan (50,000 reads/day): at 5k Transactions that is about **10 cold opens a day**, at 20k about **2**, and at 50k **one open uses the whole day's quota**.
- The persistent cache is not a hard limit. The default LRU threshold is **40 MB** in the web SDK, and documents that an active listener uses are never collected. Each small Transaction is roughly 0.5-1 KB, so 50k of them is still only tens of MB.
- **Startup time** grows linearly: the SDK reads every cached document of the collection out of IndexedDB before the first snapshot. At 5k it is fine. Field reports put it at seconds around 18k (old SDK).
- **Recommendation:** keep loading everything for v1. Before about **15k Transactions (~3 years)**, or sooner if the project stays on Spark and the app is opened more than ~5 times a day, move to **per-Account monthly balance snapshots plus a date window** for the Transaction list (details below).

## 1. Read billing on each app start

From the [Firestore pricing page](https://firebase.google.com/docs/firestore/pricing), section "Listening to query results":

- A listener is "charged for a read each time a document in the result set is added or updated". Removals caused by a change are billed; deletes are not.
- "If offline persistence is enabled and the listener is disconnected for more than 30 minutes (for example, if the user goes offline), you will be charged for documents and index entries read as if you had issued a brand-new query."
- With persistence disabled, every disconnect and reconnect is billed as a new query.
- Minimum charge: one read per query, even with no results.

What the SDK does on start (source, `@firebase/firestore@4.19.1`):

- The target's resume token and snapshot version are stored in IndexedDB (`local/local_store_impl.ts`; tokens are flushed at least every 5 minutes, `RESUME_TOKEN_MAX_AGE_MICROS = 5 * 60 * 1e6`).
- On listen, `remote/remote_store.ts` `sendWatchRequest` sends that resume token plus an `expectedCount` (the number of cached keys). The server uses an existence filter / bloom filter (`remote/watch_change.ts`) to tell the client which cached documents were deleted.

Consequence: **unchanged cached documents are not billed again if the listener resumes within 30 minutes** (tab reload, short network drop, another tab taking over). **After 30 minutes they are billed again in full**, even though the client already holds them. For a personal app that is opened a few times a day with gaps, almost every open is the "more than 30 minutes" case. Firebase's [real-time queries at scale](https://firebase.google.com/docs/firestore/real-time_queries_at_scale) guidance says the same in general: "The first time a new snapshot listener connects, the listener must load the entire result set", so "Keep the datasets for real-time queries small."

Multi-tab: with `persistentMultipleTabManager` only the primary tab holds the network listeners, so extra tabs do not multiply reads.

Egress is not a concern: 20k docs × ~1 KB ≈ 20 MB per cold open, against 10 GiB/month free.

## 2. Persistent cache: size, eviction, startup cost

- **Default size:** the [offline data doc](https://firebase.google.com/docs/firestore/manage-data/enable-offline) says 100 MB (that is the mobile SDK figure; see the [2019 Firebase blog](https://firebase.blog/posts/2019/08/why-is-my-cloud-firestore-query-slow)). The **web SDK default is 40 MB**: `LRU_DEFAULT_CACHE_SIZE_BYTES = 40 * 1024 * 1024` in `local/lru_garbage_collector.ts`, and the `cacheSizeBytes` TSDoc in `index.d.ts`: "The default value is 40 MB. The threshold must be set to at least 1 MB, and can be set to `CACHE_SIZE_UNLIMITED` to disable garbage collection."
- **Eviction:** LRU GC runs 1 minute after start, then every 5 minutes. When the cache is over the threshold it removes the least-recently-used 10% of sequence numbers (at most 1000), for targets that are **not active**. Our two listeners are always active, so their documents are never evicted. The threshold is "not a guarantee that the cache will stay below that size, only that if the cache exceeds the given size, cleanup will be attempted" (`index.d.ts`).
- **Size estimate:** a Transaction with 2-4 Entries and short text is roughly 0.5-1 KB in IndexedDB. 5k ≈ 5 MB, 20k ≈ 20 MB, 50k ≈ 50 MB. Even past 40 MB nothing breaks; GC just finds nothing to collect.
- **Startup cost:** local queries scan the collection. The offline doc: "By default, the Firestore SDK scans all documents in a collection in its local cache when executing offline queries." The 2019 blog says local queries must "unpack every document stored locally for the collection being queried". On every start the SDK deserialises the whole cached collection out of IndexedDB before the first `onSnapshot`, then our code runs Zod `parseTransaction` on each and `buildChart` over all of them. The client-side index (`enablePersistentCacheIndexAutoCreation` / `setIndexConfiguration`) speeds up *filtered* local queries but does nothing for a whole-collection listener.
- **Rough timings (no official benchmark exists):**
  - [firebase-js-sdk#4954](https://github.com/firebase/firebase-js-sdk/issues/4954) (SDK 7.x, Chrome, 2021): a query against a cached collection of **18,000 docs took 8-15 s** vs ~0.7 s for 200; it got slow "once the collection reached a few thousand documents". A maintainer called it "a known issue" and advised: "You should try to limit the number of documents that are downloaded locally." Closed as stale, not fixed.
  - An old iOS SDK estimate put it at about 1 s per 1000 documents. Both figures predate years of SDK work, so treat them as an upper bound.
  - Reasonable expectation on a modern laptop with the current SDK: **5k small docs: well under a second; 20k: one to a few seconds, worse on low-end phones.** Measure it with a seeded emulator before trusting either number.
- Our own code adds to this: `buildChart`'s `storageSum` loops over every Transaction for every Account and Group (O(Accounts × Transactions)). That is fine at 5k but should become one pass that folds Entries into a per-Account map before it is noticeable.

## 3. Free tier (Spark)

[Quotas page](https://firebase.google.com/docs/firestore/quotas): 1 GiB stored, **50,000 reads/day**, 20,000 writes/day, 20,000 deletes/day, 10 GiB/month egress; "Quotas are applied daily and reset around midnight Pacific time." The [pricing plans page](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) says that on Spark, going over a no-cost quota shuts that product off until the quota resets (it describes this per month, while the Firestore page describes daily quotas). Either way the app stops reading once the reads run out. On Blaze, reads are a few cents per 100k (see the [Cloud pricing page](https://cloud.google.com/firestore/pricing) for your region).

Reads per cold open ≈ number of Transactions + Accounts (Accounts are negligible):

| Transactions | Reads per cold open | Cold opens/day before 50k | Storage |
| ------------ | ------------------- | ------------------------- | ------- |
| 5,000 (~1 yr) | ~5k | ~10 | ~5 MB |
| 20,000 (~4-5 yr) | ~20k | ~2 | ~20 MB |
| 50,000 (~10+ yr) | ~50k | 1 | ~50 MB |

Storage and writes are never close. Reads are. A habit of checking the app every few hours, plus phone and laptop each doing their own cold opens (each device has its own cache), reaches the limit around 10-15k Transactions. On Blaze the cost stays tiny (tens of thousands of reads a day is cents a month), so the real limit there is startup time, not money.

## 4. Options and when they make sense

### A. Keep loading everything (today)

Simple, works offline, and every Balance as of any date is exact. Costs grow linearly with total history on every cold open. **Good up to roughly 10-15k Transactions on Spark** (or up to roughly 20k on Blaze, where startup time is the limit).

### B. Date-window queries for the Transaction list

`where('date', '>=', windowStart)` (for example, the current and previous 12 months). The opening Transaction with `date: null` needs a separate query, because Firestore range filters do not match null. Reads and startup become proportional to the window, not to all history. **The catch:** a Balance needs every Entry dated on or before the as-of date, so a window alone breaks Balances. It has to come with C.

### C. Stored totals: running totals or periodic balance snapshots

- **Per-Account running total** (one number per Account, updated in the same `writeBatch`/`runTransaction` as each Transaction write): gives exactly one Balance, "as of now including future-dated Entries". It does not give Balance as of a date. Every create, edit or delete must adjust it atomically, and backdating does not affect it. It is cheap but answers the wrong question for our Balance definition (GLOSSARY: Entries dated later "do not count yet").
- **Monthly balance snapshots** (one doc per month, holding the net change per Leaf Account for that month: `users/{uid}/periods/2026-11 = { [accountId]: centavos }`): Balance as of date D = sum of the closed months' totals before D's month (or a running snapshot) + Entries in D's month up to D. This fits double-entry and free backdating. Every Transaction write updates the period doc(s) for its date (and the old date's period on edit) **in the same Firestore transaction**, using `increment()` per Entry. A backdated Transaction just touches an older month. Since each period doc only holds that month's net changes, nothing after it needs rewriting. Totals for all history = the sum of all period docs. That is about 12 docs a year, so 10 years is 120 small reads instead of 50k.
  - Writes stay within limits: one Transaction write becomes 1-3 doc writes.
  - Integrity: the domain module can recompute period totals from Transactions in tests, and a "rebuild snapshots" maintenance action can repair drift. Firestore rules cannot check the sums, but this is a single-user app.
  - Combined with B: load the period docs plus the Transactions in the window. Balances as of any date inside the window are exact. Older dates need either a one-off `getDocs` of that month or the monthly figure only.

### D. Firestore aggregation queries (`sum()`)

[Aggregation docs](https://firebase.google.com/docs/firestore/query-data/aggregation-queries): billed one read per **1000 index entries** (minimum 1). They are "served only by the Cloud Firestore backend, skipping the local cache", and "You can't use aggregation queries with real-time listeners and offline queries." They time out after 60 s. `sum()` adds a **top-level numeric field**. Our amounts live in an `entries` array, so they cannot be summed per Account without a separate document per Entry (`entries` subcollection or a collection-group with `accountId`, `date`, `amount`). Even then, that is one aggregation query per Account per as-of date, with no offline support and no live updates. **This does not fit a live, offline-first ledger.** It might work later for occasional reports, not for Balances.

## Recommendation

- **v1:** keep A (load everything). It is correct, simple, and well inside limits for the first year or two. Do two cheap things now: make `buildChart` a single pass over Entries (O(Transactions + Accounts)), and keep all Balance math in the domain module so the data source can change later.
- **Change trigger:** move to **C (monthly balance snapshots) + B (date-windowed Transaction listener)** when any of these is true:
  - about **15,000 Transactions** (~3 years at 5k/yr), or
  - daily reads regularly pass **~25k** (half the Spark quota; watch the Firestore usage tab), or
  - cold-start to first Balance passes **~1 s** on the slowest device you use.
- Moving to Blaze removes the read limit but not startup time, so it only pushes the trigger towards ~20k.
- Do not use aggregation queries for Balances.
- Measure before deciding: seed the emulator with 5k / 20k synthetic Transactions and time `subscribeLedger` → first chart render with the persistent cache. Emulators run with a memory cache in this repo, so use a production-like persistent cache for that test.

## Sources

- Firestore pricing, "Listening to query results" and aggregation billing: https://firebase.google.com/docs/firestore/pricing
- Firestore quotas and free tier: https://firebase.google.com/docs/firestore/quotas
- Firebase pricing plans (Spark over-quota behaviour): https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Access data offline (cache size, cleanup, local query scans): https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Real-time queries at scale: https://firebase.google.com/docs/firestore/real-time_queries_at_scale
- Aggregation queries: https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- Firebase blog, "Why is my Cloud Firestore query slow?" (2019): https://firebase.blog/posts/2019/08/why-is-my-cloud-firestore-query-slow
- firebase-js-sdk#4954 (slow queries with large persisted collection): https://github.com/firebase/firebase-js-sdk/issues/4954
- SDK source, `@firebase/firestore@4.19.1` (from the package source maps): `src/local/lru_garbage_collector.ts` (40 MB default, 10 percentile, 1000 max), `src/local/local_store_impl.ts` (resume-token persistence), `src/remote/remote_store.ts` (`sendWatchRequest` with resume token + `expectedCount`), `src/remote/watch_change.ts` (existence/bloom filter), `src/local/query_engine.ts` (client index auto-creation, off by default), and `dist/index.d.ts` (`cacheSizeBytes` TSDoc).
