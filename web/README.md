# Not Firm frontend

A static React / TypeScript interface for the deployed NOTSTOCK launch on Robinhood Chain. It includes Home, Burn, LP Desk, governance, embedded module setup and operator controls. The shipped files are in [`../dist/`](../dist/); they require an HTTP(S) static host, with no server-side application or route rewrites.

## Install, build and serve

Use Node 22.12+ (validated with Node 24.21.0). From this directory:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run verify
npm run preview -- --port 4173
```

`npm run build` typechecks, exports Vite with `base: './'` to the repository-root `dist/`, then generates `dist/imd-deployment.json` from the final bytes. `npm run verify` independently regenerates the expected inventory in memory and compares it with the manifest. Do not edit exported files after generation. Hash routes (`#home`, `#burn`, `#desk`) and relative assets work at a gateway subpath. There are no remote fonts, analytics, embedded frames or remotely loaded scripts before Connect.

For development, run `npm run dev`. The development server serves the same generated `dist/imd-deployment.json` and local public assets. Rebuild after changing ABIs or module assets so the manifest inventory stays current. Do not create a separate deployment configuration for development.

## Configuration and provenance

The browser fetches **only `imd-deployment.json`** for deployed application addresses, chain, pool key, public RPCs, explorer and Uniswap infrastructure. It fetches the referenced application ABIs and verifies their canonical Keccak hashes. Additional implementation ABIs are checked against their manifest SHA-256 entries. `src/config.ts` contains protocol interface fragments, runtime loading, wallet transports and the fixed, verified launch number; it contains no alternate deployment address table.

`handoff.json` and `network.json` are preserved **build inputs**, not imported by application code. When pinned `.imd/reads/` inputs exist, the manifest generator uses those instead. Both the full pool key and the network / walletAddChain blocks are copied unchanged. The four-contract handoff is preserved exactly, including source commit `07317d5f93e9fb486c5ceca471ec749379af804f` and attestation hash. The module and Burner addresses are read from LpDesk, and their LP Desk binding is checked. The launch factory comes from LpDesk; its `positionOf(3232)` and registry artifacts are checked against the handoff before setup is usable.

Launch number **3232** and deployment block **112566380** were derived from the attested deployment receipt, not inferred from token names. See [`../docs/validation/launch.json`](../docs/validation/launch.json). Setup accepts no editable launch number. Each embedded module creation code is compiled from the pinned implementation and checked against `LpDesk.codeHashOf(kind)` before sending `deployModule`.

The frontend build is independent of Foundry. Reproducing the ABI / bytecode provenance check, from the repository root, additionally requires Foundry and the pinned source:

```sh
forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache --skip test --skip script
node web/scripts/prepare.mjs
node web/scripts/live-check.mjs
```

This writes compilation artifacts only in disposable scratch space, compares all nine ABIs with `git show <sourceCommit>:docs/abi/<Contract>.json`, and compares the four creation-code hashes with the deployed desk. Required ABIs and bytecodes are included under `public/`; ordinary `npm ci && npm run build` does not need scratch files, Foundry, or RPC access.

## Wallets and transactions

Connect discovers browser wallets through EIP-6963, with an injected-provider fallback. On a phone without an injected wallet, the picker offers the current page in MetaMask, Coinbase Wallet, Rabby and Phantom. Coinbase Smart Wallet is loaded only when selected. There is no WalletConnect project ID, relay, application key, private RPC credential or saved account session. The application does not use localStorage, sessionStorage, cookies or IndexedDB. Wallet software may manage its own session.

Connect requests the configured chain. An unknown-chain switch failure offers the exact `wallet_addEthereumChain` parameters and retries switching. A wrong-chain state disables writes and exposes a single switch control. Public RPCs are tried in their configured order, with the connected provider as a read fallback only when it is on the correct chain. Reads refresh every 15 seconds while visible; event history refreshes at most once per minute and after confirmed writes. A failed verification blocks writes and exposes Retry.

Each transaction is simulated, gas is estimated, and a review dialog describes the action, destination, native value / LayerZero fee, and estimated network fee. The selected account and chain are checked again before asking the wallet to sign. Transactions wait for a successful receipt and refresh balances. Rejection and contract errors are distinct from RPC errors. Every implementation custom error has a plain-language mapping.

The in-app trade uses the handoff's IMD/NOTSTOCK pool. Quotes use `simulateContract` on the configured quoter. IMD / NOTSTOCK approval to Permit2 and Permit2 approval to the configured router are separate exact-amount steps. The router receives `0x10`, actions `0x060c0f`, the exact pool key, and the Robinhood six-field swap tuple. Quotes expire after 60 seconds; the router deadline is twenty minutes. The required ETH buy link opens Uniswap and derives its output currency from the runtime manifest. No fiat price source is supplied, so the app shows token units and explicitly states that USD pricing is not provided.

## Launch setup and operation

The live launch initially has four undeployed modules, an unfunded splitter, and the project wallet as fee recipient. The interface shows **After setup** for undeployed-module values. Any connected wallet may deploy each embedded module. The project wallet funds exactly 600,000,000 NOTSTOCK after all modules exist, and the current fee recipient calls `setRequester(3232, FirmVault)`. Register is gated on deployed modules, funding and the fee recipient; Split follows registration. Completed setup buttons disappear. These writes were rehearsed on a local fork, not sent to the public chain.

Only the current on-chain operator sees operator actions. The asset and venue lists come from PriceGuard, including newly governed venues. Open uses the seven-day bootstrap; later openings require governance. Position math uses BigInt and mirrors the pinned PoolMath rounding. Opening and top-up previews show the required 99.5% minimums; withdrawal and buyback minimums use operator-entered slippage. Every balance-sensitive control blocks amounts above the corresponding balance or basket before signing. Read-only position data remains visible to everyone.

Weekly statistics are reconstructed from logs beginning at the deployment block: vault receipts excluding internal desk credits, desk fee-split events, buyback events, and NOTSTOCK transfers into and out of the dead address. Project receipts are the project shares of distribution / fee-split events, not unrelated transfers to the project wallet. The week is bounded by block timestamps; scanning adapts its request size to RPC log limits and reports progress / retry errors. No archive-state service is needed for burn changes. No events or balances are stored persistently.

## Validation

```sh
# From web/; optionally point IMD_CHROMIUM at an installed Chromium executable.
npm run test:browser
node --import tsx scripts/boundary-check.mjs

# From the repository root; read-only live browser transport validation.
node web/scripts/live-browser.mjs

# Local fork only; requires the scratch compilation above, Anvil and Chromium.
NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost node web/scripts/fork-check.mjs
```

Browser tests serve the production export under `/preview/`, use mocked RPC / wallet responses, and save results in `test/scratch/browser-check/`. Fork tests use a fresh configured RPC block, impersonate the documented wallets only inside Anvil, and refuse write methods in the public-RPC relay. They never use a private key or broadcast publicly. `IMD_CHROMIUM` selects an installed browser; otherwise validation uses Playwright’s installed Chromium (`npx playwright install chromium`). Read-only live validation has a Node transport bridge because direct browser requests to public RPCs returned empty responses on this worker.

See [`../docs/VALIDATION.md`](../docs/VALIDATION.md) for results, review coverage and limitations, [`../docs/DESIGN.md`](../docs/DESIGN.md) for implemented design tokens, and [`../docs/ADAPTATION.md`](../docs/ADAPTATION.md) for assignment scope decisions. Publication, IPFS pinning and named-site checks are subsequent publisher tasks.

From the repository root, `node web/scripts/delivery-check.mjs` checks the write scope, excluded dependencies / caches, submodules, all asset hashes and a conservative uncompressed 8 MiB submission budget. It writes `docs/validation/delivery.json`.

## Asset attribution

The frog logo, favicon and share image use the repository's supplied brand artwork. Wallet marks are bundled local assets, sourced from the corresponding wallet marks in the [RainbowKit repository](https://github.com/rainbow-me/rainbowkit) and [Coinbase wallet guidelines](https://docs.cdp.coinbase.com/coinbase-wallet/introduction/wallet-logo-guidelines). Better Interface guidance is adapted from Jakub Krehel; documentation guidance from Paul Bakaus's Impeccable; Ethereum UX guidance from Austin Griffith's ethskills. Their provided notices are retained in [`../docs/licenses/`](../docs/licenses/).
