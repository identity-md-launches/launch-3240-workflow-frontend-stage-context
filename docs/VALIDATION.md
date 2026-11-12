# Frontend validation

Validation date: 12 November 2026. Final results: build/typecheck pass; 10 unit, 33 browser-interaction, 6 boundary and 8 local-fork checks pass; 16/16 taste checks; zero Axe violations. These are worker-run checks, not independent certification. The deployed implementation remains at source commit `07317d5f93e9fb486c5ceca471ec749379af804f`. No transaction was broadcast to the public chain, and no contract was changed or redeployed there.

## Build and deployment integrity

- Vite production build and strict TypeScript check run through `web/package.json`'s `build` command; unit tests run through `npm test`.
- All nine exported implementation ABIs match `docs/abi/<Contract>.json` at the pinned source commit and match locally compiled ABIs. The four handoff ABI hashes match canonical sorted-JSON Keccak. All four embedded creation-code hashes match deployed `LpDesk.codeHashOf`. Evidence: [abi-and-modules.json](validation/abi-and-modules.json).
- Read-only RPC validation verified chain 4663, nonempty code at all four attested addresses, the deployment receipt / registry binding, the fixed launch number 3232, and the exact pool key. Evidence: [launch.json](validation/launch.json).
- The browser uses `imd-deployment.json` and its referenced ABI files. The manifest generator validates the exact contract set, addresses, hashes, source / attestation identifiers, poolKey, network and walletAddChain, and enumerates every other exported file. `node web/scripts/manifest.mjs --check` compares the final inventory and all SHA-256 hashes with the pinned inputs.
- Static hosting is tested under `/preview/`, without route rewrites. Source, package manifest, lockfile, ABIs, module creation code, local brand / wallet assets and the static export are delivered. Dependencies and caches are excluded from Git. Final file and byte counts are in [delivery.json](validation/delivery.json).
- The Vite development server was also started and its manifest compared with the export; the entrypoint and identical runtime configuration were served successfully. Evidence: [dev-server.json](validation/dev-server.json).

## Unit tests

Ten tests exercise ABI binding; amount parsing with token decimals, precision and balance limits; exact tick extrema / inverse; token order and decimal scaling; position previews and 99.5% minimums; the extended six-field Robinhood swap tuple, settlement and output minima; unknown-chain addition; rejection without unintended chain addition; coverage of every implementation custom-error translation; and event-derived weekly burn changes without archive-state reads. See [unit-tests.txt](validation/unit-tests.txt).

## Browser interactions

The production export is served by `web/scripts/serve.mjs`. `web/scripts/browser-check.mjs` uses Playwright and ABI-encoded mocked RPC responses, with an EIP-6963 wallet whose transaction calls mutate the fixture only. It records actual interactions, not just component snapshots. The complete result list is in [browser.json](validation/browser.json).

Coverage includes disconnected reads and disabled writes; no external scripts / fonts / frames before Connect; wallet sheet Escape and focus restoration; rejected connection recovery; unknown-chain addition and rejected-switch retry; decimal amounts, Max and balance guards; Burner deposit and burn receipts; exact staking approval, stake and unstake; proposal voting, expiration and AddVenue refresh; both swap approval stages and universal-router execution; bridge record display and quoted LayerZero native fee; operator visibility, bootstrap limits, collection and close; embedded module deployment and complete setup order; missing-mobile-wallet deep links; and accessibility / overflow checks.

Mocked values and mock transaction hashes are test fixtures only. They are not shipped runtime configuration or used as real deployment addresses. Tests do not establish that a live wallet vendor accepts this chain, that liquidity remains sufficient, or that remote bridge delivery completes.

The additional [boundary checks](validation/boundaries.json) use maximum uint256 wallet balances at 320 and 390px, permissionless FirmVault distribution, cancelled transaction review, rejected wallet signing, a new-block pool-price update that preserves manual operator fields, and a deliberately corrupted implementation ABI that must fail closed. The connected operator Axe scan has **zero violations**, with raw output in [axe.json](validation/axe.json).

## Live-chain reads and local fork

[live-browser.json](validation/live-browser.json) records live Home and setup reads rendered in the production app, including completion of the weekly report: 33 read-only RPC requests, no JavaScript errors and no transport errors. Direct Chromium requests to the public RPCs returned `net::ERR_EMPTY_RESPONSE` on this worker. The test therefore transported read-only browser RPC requests through Node fetch to the exact configured endpoints. This transport is test scaffolding, not an application dependency. The ordinary browser interaction suite and fork suite also inspect the rendered app independently of public browser egress.

[fork.json](validation/fork.json) records eight passing checks against a fresh Robinhood-chain state fork in local Anvil. All public upstream methods were limited to reads. Actual deployed application code and factory state were used; the project and operator wallets were impersonated only on the local node. The rehearsal:

1. Deployed all four exact module creation bytecodes.
2. Funded exactly 600,000,000 NOTSTOCK, set the real factory requester, registered launch 3232 and split genesis, checking LP Desk received 500,000,000 NOTSTOCK.
3. Verified a non-operator sees no operator action.
4. Compared the venue picker exactly with `PriceGuard.venues()`.
5. Opened a real single-sided v4 position through the production browser interface during bootstrap and observed Close enabled.
6. Added a new venue through actual staking, proposal, vote, EVM time advancement and execution, then observed the new picker entry without a site change. The new venue was an explicitly local FakeVenue test contract.
7. Advanced local EVM time past bootstrap, confirmed Open disabled and Close still enabled, then successfully closed the position through the browser.
8. Checked no browser JavaScript errors.

Time advancement used `evm_increaseTime`; it did not wait days on the machine. Old fork block attempts failed because public RPCs did not retain that account state. A fresh head from the second configured endpoint succeeded. No external RPC endpoint, API credential or historical-state subscription was added.

The live launch remained unregistered with all four modules undeployed at the recorded read. Setup controls expose the required authorized actions; this frontend task intentionally does not execute them on the live chain.

## Better Interface consolidated review

The pinned guide's workflow, all six core domains and document-web-design section were read and applied while building. The final pinned taste probe passed **16/16 checks** against the full rendered export, with 17 controls measured at 390px. Its full measurements are in [taste.json](validation/taste.json). Screenshots are retained in [validation/screenshots/](validation/screenshots/). This probe captures the RPC-retry state on this worker; the separate mocked and live-read browser checks cover loaded data.

| Domain | Source review and rendered coverage | Result / limits |
| --- | --- | --- |
| Accessibility | Labels / descriptions, keyboard-native forms, named navigation and network region, skip link, visible focus, modal cancellation / restoration, progress labels, status / error semantics, reduced-motion CSS. Playwright keyboard check and Axe on expanded LP Desk. | Observed landmark issue fixed; final Axe output retained. No manual screen-reader or physical assistive-device session. |
| Layout | First-screen product / main action / wallet at 390; Home at 320, 390, 768, 1440; Burn / LP Desk / wallet sheet at 390; expanded operator controls at 320 and 1440; long amounts / addresses. | Automated horizontal-overflow checks and screenshot inspection. No sticky overlay; narrow fields and address rows wrap. |
| Writing | Exact slogan / buy label, units and fee split; plain prerequisite reasons, explicit review descriptions, correct Connect wallet / After setup states, recoverable errors. | Duplicate long setup reason shortened. Contract reverts remain action errors. No invented fiat prices. |
| Typography | Six-size scale per width, three weights, system Arial stack, tabular numbers, heading hierarchy and normal tracking. | Rendered taste measurements; no external font dependency. Platform-specific font rasterization is not certified. |
| Colors | Canonical CSS tokens, text / backgrounds / focus / error, statuses with text as well as color. | Taste measures text contrast on solid backgrounds; Axe supplements the connected desk. Third-party wallet UI is outside the page. |
| UI | Explicit approvals, quotes / expiry, disabled prerequisite reasons, simulation, wallet confirmation, receipt / refresh / explorer feedback, empty / loading / error states. | Interaction suite plus actual fork Open / Close / governance refresh. Hardware wallets and live passkey creation remain untested. |

### Findings and repairs

| Finding | Source location | Repair / verification |
| --- | --- | --- |
| Repeated five-plus-word setup reason on Home. | `web/src/Home.tsx`, distribution actions | One shared explanation, concise per-action `Register first`; taste repetition check rerun. |
| Network line outside an accessibility landmark. | `web/src/App.tsx`, `.network-line` | Added named `role="region"`; Axe rerun on the connected operator page. |
| Amount changes reset allowances without rerunning their fetch, blocking progression. | `web/src/Home.tsx`, `Swap` allowance effect | Fetch / reset now tracks account, input token and block; both approvals and swap tested end to end. |
| React could retain a preceding approval's receipt on the next action. | `web/src/Home.tsx`, `web/src/Governance.tsx`, staged `Tx` instances | Explicit keys per approval / swap / stake action; confirmed state stays with its action. |
| A newly empty Burner could hide confirmation behind its new disabled reason. | `web/src/components.tsx`, `Tx` status | Receipt confirmation and the new prerequisite are both shown; burn receipt / refresh test passes. |
| Sequential ABI fetches could leave the visual probe on a transient loading screen. | `web/src/config.ts`, `loadConfiguration` | Parallel fetches preserve all integrity checks; final probe rerun alone, with separate first-screen assertions after state loads. |
| Weekly burn comparison depended on archived balance state unavailable at a public endpoint. | `web/src/chain.ts`, `history` | Exact net NOTSTOCK Transfer events to/from dead; tested incoming / outgoing / unrelated transfers without `readContract`. |
| Unstake balance of an undeployed governor could read Connect wallet after connection. | `web/src/Governance.tsx`, `Amount` | Explicit After setup label for that module-dependent balance. |
| Account-change check accepted any wallet-returned account rather than the selected first account. | `web/src/App.tsx`, `checkSigner` | Rechecks the selected account and chain before the signature request. |
| The operator form's displayed pool price refreshed only after changing the selection. | `web/src/Operator.tsx`, `OpenForm` price effect | Refreshes with each new snapshot block while retaining the operator's entered price / range; boundary interaction test verifies both. |

Full numeric `file:line` references for this final source are recorded in [review-locations.json](validation/review-locations.json), avoiding stale line references as formatting changed during review.

## Limits and deferred external checks

- Git staging was attempted after validation, but the machine returned `Unable to create .git/index.lock: Read-only file system`. Source, lockfile, static export and evidence are complete in the working tree; this worker could not create a Git commit. No attempt was made to bypass the protected Git metadata. The publisher must capture these delivered files.
- No live swaps, approvals, burns, staking, distributions, bridge sends, module deployments or owner/operator writes were broadcast. Mocked interactions cover those UI paths; the fork covers the actual setup, opening / closing and AddVenue paths listed above. Shift, top-up, non-IMD buyback, liquidity move, role handover, real bridge settlement and multiple real wallet implementations were not exercised against public funds.
- Coinbase Smart Wallet is implemented with its SDK and lazy loading, but no live passkey creation or Coinbase transaction was attempted. Mobile wallet links were checked for correct current-page encoding, not opened on installed phone apps.
- RPC availability, browser CORS behavior outside this worker, chain reorgs, mempool price changes and liquidity at a later block are external conditions. Simulation and on-chain minimums remain active. Full-history log scanning can become slow as activity grows; progress and retry are explicit, and there is no backend indexer or persistent cache.
- Open Graph image and favicon are local and present. Absolute social URLs await the publisher's origin. IPFS CID, site naming, hosted asset / ABI hashes and publication RPC checks are not worker-completion prerequisites and have not been claimed as passed.
- `docs/DESIGN.md` is the scoped design deliverable; root `DESIGN.md` is excluded by the overriding path budget. No root configuration was altered.
