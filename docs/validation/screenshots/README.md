# Rendered evidence

- `probe-390.png`: pinned taste probe, final static export, 390px CSS viewport at device scale 2. This captures the worker's direct-public-RPC error recovery state. Product, exact slogan, wallet control and main ETH buy action remain on the first screen.
- `home-390.png`, `home-1440.png`: final production browser interaction suite with explicitly mocked wallet / chain state. Financial values are test fixtures, not claims about current live balances.
- `operator-320.png`: expanded operator controls at 320px, from the same mocked suite. No horizontal overflow.
- `fork-completed.png`: actual local Anvil fork after setup, opening, governed AddVenue, bootstrap expiry and successful closing. The public chain was not changed.
- `live-setup-390.png`: actual public-chain read-only setup state rendered through the test's Node RPC transport bridge.
- `live-home-390.png`: actual public-chain price, balances and completed weekly report, using that same read-only transport.

The screenshots are evidence of the stated test states only. No screenshot of a live wallet signature or passkey flow is claimed.
