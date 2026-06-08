# Testing & isolated local dev

All tests and the isolated dev server run **without touching any cloud database
or service**. Mongo is an ephemeral in-memory instance (`mongodb-memory-server`);
Auth0 Management, email and SMS are disabled; auth is mocked.

## Isolation guarantees

| Concern | How it's isolated |
| --- | --- |
| MongoDB | `mongodb-memory-server` (in-process, discarded on exit). The app reads `MONGODB_TEST_URI`. Real `MONGO_*` cloud creds are never used. |
| Auth0 login | Integration tests mock `getAuthContext`; e2e seeds an `osk_` API key and uses Bearer auth. Placeholder Auth0 creds satisfy the NextAuth config module. |
| Auth0 Management API | `AUTH0_DISABLE_MANAGEMENT=true` → `Auth0UserManager.getUser()` short-circuits to `null` (free plan, no limits). No request leaves the machine. |
| Email / SMS | `EMAIL_ENABLED=false`, `SMS_ENABLED=false`; services are jest-mocked in integration tests. |

## Commands

```bash
yarn test            # unit (node + jsdom)
yarn test:integration # API route handlers vs in-memory Mongo
yarn test:e2e        # Playwright: boots `next dev` on in-memory Mongo, drives the signer UI
yarn test:all        # everything
```

Test layout:

- `__tests__/unit/**` — pure logic (contractUtils, SMS builder, components).
- `__tests__/integration/**` — real route handlers (`POST/GET/PATCH /api/signature-requests`, signer GET) against in-memory Mongo. See `field-fidelity.test.ts` for the data-preservation suite.
- `e2e/**` — full HTTP + browser flow. `signature-request-happy-path.spec.ts` (signature flow) and `mivet-integration.spec.ts` (cross-repo, below).

First run downloads the MongoDB 7.0.14 binary (cached afterwards), so the first
integration/e2e run is slower.

## Isolated dev server (manual / for mivet integration)

```bash
yarn dev:isolated              # http://localhost:3000, in-memory Mongo, cloud-free
PORT=3010 yarn dev:isolated    # custom port
```

It prints a ready-to-use dev API key (`osk_local_dev_key_…`) and a demo contract
id. Real cloud databases are never contacted.

## Cross-repo integration with mivet-appfront

`e2e/mivet-integration.spec.ts` drives mivet's **real** client code
(`../mivet-appfront/lib/osign-client.ts` + `lib/esign-fields.ts`) against the
live local oSign and asserts the full data contract survives (multi-word dynamic
fields, NIF/`clientTaxId`, account variables). It runs automatically as part of
`yarn test:e2e` and requires the sibling `../mivet-appfront` repo to be present.

For manual end-to-end testing of the running apps:

1. `yarn dev:isolated` here (note the printed API key + URL).
2. In `mivet-appfront`, set `OSIGN_BASE_URL=http://localhost:<port>` and use the
   printed key as the clinic's `osign_apikey`, then `yarn dev`.
