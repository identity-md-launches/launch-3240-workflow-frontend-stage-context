# Frontend-stage scope decisions

No deployed contract, economic rule, recipient, supply, threshold, fee, bootstrap period, voting period or permission was changed. Source and ABIs are pinned to the deployed handoff. This stage does not deploy contracts or publish a site.

1. The acceptance text requests repository-root `DESIGN.md`, but the assignment's explicit overriding write budget allows only `web/**`, `dist/**` and `docs/**` (and `web/.gitignore`). The complete design document is therefore delivered at **`docs/DESIGN.md`**. No root file is changed.
2. The app uses in-memory connection state rather than automatic persisted wallet reconnection. This follows SITE.md's no-storage requirement while retaining EIP-6963, mobile wallet browsers and Coinbase Smart Wallet.
3. No public origin is supplied before the publisher hosts the export. Open Graph assets and all frontend assets therefore use relative URLs. Absolute social metadata is a publisher follow-up once the origin exists.
4. Direct Chromium RPC requests returned `net::ERR_EMPTY_RESPONSE` on this worker. Live browser reads were validated using a Node transport bridge to the same configured public RPCs; local-fork and mocked browser interactions were also run. The shipped application retains direct configured RPC reads and wallet-provider fallback. No bridge service is shipped or required by the app.
5. Public RPCs did not serve old historical account state in fork experiments. Weekly burn changes are computed from the fixed token's Transfer events, and the fork rehearsal uses a fresh head from the configured Robinhood RPC. No paid service, extra RPC address or archive-state dependency was added.

Explicit ignore-file path budget: **`web/.gitignore` only**. It excludes dependency and cache folders at every nesting level under web. No other ignore file or root build configuration is changed.
