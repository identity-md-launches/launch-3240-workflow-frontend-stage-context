# Not Firm design

## Overview

Not Firm is a treasury and governance interface for NOTSTOCK holders, permissionless callers and the current LP Desk operator. The supplied frog artwork and exact slogan are retained. Warm neutral backgrounds, dark green text and a pale green primary action keep the financial controls legible without adding a separate marketing page.

The Home introduction and trading panel share the first desktop row. On mobile, the logo, slogan, ETH buy action, live price and wallet access precede the in-app trade form. Other pages use a single reading column with divided sections, compact data rows and expandable advanced controls. This is a light-only interface; there is no unused dark theme or external font dependency.

This document is in `docs/` because the assignment's overriding file budget excludes root `DESIGN.md`; see [ADAPTATION.md](ADAPTATION.md).

## Colors

The canonical definitions are CSS custom properties in [`web/src/styles.css`](../web/src/styles.css).

| Token | Value | Use |
| --- | --- | --- |
| `--page` | `#f3f1e9` | Page background |
| `--surface` | `#fffef9` | Inputs, trade panel, dialogs |
| `--soft` | `#e6e9dc` | Selected navigation, disabled controls, previews, notices |
| `--text` | `#203124` | Main text and fee-flow bars |
| `--muted` | `#596153` | Secondary text, labels, disabled text |
| `--line` | `#c4c9b9` | Input borders and section / row dividers |
| `--accent` | `#d5ec9c` | Primary ETH buy action and confirmation button |
| `--accent-hover` | `#c3e17d` | Primary hover state |
| `--error` | `#9c2c20` | Validation and transaction errors |
| `--focus` | `#285a37` | Focus outline, success text, live indicator, quorum progress |

Every status also has text; color is supplementary. The automated rendered contrast review checks solid-background text against WCAG's 4.5:1 / large-text 3:1 thresholds. Exact measurement output is retained with validation rather than claiming all possible third-party wallet surfaces were measured.

## Typography

The font stack is `Arial, Helvetica, sans-serif`, using system-installed fonts. Body text is 16px with line-height 1.5 and tabular numbers. The rendered probe identified Arial. Three requested weights are used: 400 body, 600 controls / subheadings / key values, 700 primary headings and wordmark. Browser font rendering supplies those weights; no font files are downloaded.

| Role / token | Desktop | Mobile |
| --- | --- | --- |
| `--small` | 14px | 14px |
| `--body` | 16px | 16px |
| `--lead` | 18px | 18px |
| `--h3` | 20px | 20px |
| `--h2` | 24px | 24px |
| `--display` | 48px | 36px below 680px |

H1 is the heaviest heading, line-height 1.1 with `-0.04em` tracking. H2 uses line-height 1.25 and `-0.02em`; H3 uses 1.4. There are no tracked uppercase labels above headings. The slogan is 24px on desktop and 20px below 900px; its text is fixed by the brief. Prose has a 70ch maximum measure. Long numerical values and addresses wrap; transaction amounts are kept as BigInt for computation and formatted for display. Form inputs remain at least 16px to avoid mobile browser zoom.

## Layout

The shared content width is `min(1160px, calc(100% - 64px))`. Desktop gutters are 32px; mobile gutters are 16px. Spacing uses 4, 6, 8, 12, 16, 20, 24, 28, 32, 40, 48, 64 and 80px where needed, defined in component CSS rather than an invented token scale.

At 900px, header and Home spacing tighten and the identity artwork shrinks. At 680px, navigation wraps into its own row, Home becomes one column, statistics and forms stack, setup rows stack, and the fee split becomes a two-column grid. The header is not sticky, so it does not obscure content. Mobile dialogs use a bottom sheet with a safe-area bottom inset; transaction review retains a centered, scrollable dialog.

`.section`, `.section-head`, `.stats`, `.two-col`, `.form-grid`, `.data-row`, `.balance-row`, `.actions` and `.setup-row` are the reusable layout primitives. Grid children use `minmax(0, 1fr)` / `min-width: 0`. Addresses use wrapping links and a copy control instead of forcing a full address into the header. Native selects retain their keyboard behavior and truncate the closed selection if necessary.

Rendered Home was inspected at 320, 390, 768 and 1440px; Burn and LP Desk at 390px; expanded operator controls at 320 and 1440px. The mobile first screen includes Not Firm, the exact slogan, wallet access, the primary ETH buy action and live price. Automated overflow assertions cover these states. Physical-device Safari, screen magnification and OS high-contrast rendering were not run.

## Elevation & Depth

Main content is flat: section and data-row dividers, with a tonal surface for the trade form and transaction preview. There are no nested shadowed cards. Dialogs alone use `box-shadow: 0 24px 80px #0004`, with a `#11221bb3` backdrop. Their native top-layer placement handles modal stacking and focus confinement. The skip link uses z-index 10 when focused.

## Shapes

The trade panel uses `--radius: 14px`; form controls, previews and notices use 8px; status labels use 6px; dialogs use 16px. Mobile wallet sheets round only their top corners. Brand artwork is circular. Borders are generally 1px. Fee-flow bars are 6px and show the four actual 25% destinations; they are not a decorative graph.

## Components

| Component / source | Purpose and states |
| --- | --- |
| `Section`, `Stat`, `Empty` in [`components.tsx`](../web/src/components.tsx) | Section headings, labeled data and honest empty / loading messages. `Section` accepts `title`, `aside` and optional `id`. |
| `Field`, `Select`, `Amount` in `components.tsx` | Associated labels and hints. `Amount` adds token units, full balance, Max, decimal keyboard and `aria-invalid`; Max uses exact token decimals. Undeployed-module and disconnected values remain distinct. |
| `Tx` in `components.tsx` | A transaction action with `label`, `description`, `call`, optional prerequisite `reason`, busy state, inline status / error and receipt explorer link. It delegates simulation, review and wallet signing to `App.tsx`. |
| `AddressLink` in `components.tsx` | Checksummed address tooltip, explorer link and Copy feedback. Long addresses wrap and never set layout width. |
| `WalletSheet` in [`Wallet.tsx`](../web/src/Wallet.tsx) | Native modal dialog. Named EIP-6963 wallets, generic injected fallback, four mobile wallet-browser links and lazy Coinbase Smart Wallet. Loading disables duplicate requests; rejection is recoverable. |
| Transaction review in [`App.tsx`](../web/src/App.tsx) | Describes the exact action, contract, chain, ETH / LayerZero fee and estimated gas cost. Back / Escape cancel without sending; Confirm asks the wallet to sign. |
| `BuyLink`, `Swap`, `BasketTable` in [`Home.tsx`](../web/src/Home.tsx) | Runtime-derived ETH buy URL, explicit quote / two approval / swap sequence, live free / top-up / buyback balances. Quotes have an expiry and a minimum output. |
| `OpenForm`, operator position controls in [`Operator.tsx`](../web/src/Operator.tsx) | Live venue and asset selection, presets / manual ranges, exact tick and minimum previews, basket limits and operator-only actions. Non-operators see read-only positions. |
| Governance / Setup in [`Governance.tsx`](../web/src/Governance.tsx), [`Setup.tsx`](../web/src/Setup.tsx) | Quorum progress with text, proposal deadlines / expiry, bridge records and fee preview; setup prerequisite reasons and removal of completed controls. |

Navigation uses ordinary hash links with `aria-current`. Route changes focus the page H1 and scroll to the top. Focusable controls receive a 3px visible outline. Native dialogs support Escape and restore focus; wallet-dialog restoration was tested. Status messages use `role="status"`, errors use `role="alert"`, and network state has a named region. Buttons generally have 44px minimum height; small utility controls remain at least 36px with spacing. Motion is limited to 120ms color / press feedback and is omitted under reduced-motion preferences.

## Do's and Don'ts

- Start a page with the existing H1 / page-title pattern and `Section`; use existing list and form primitives before introducing another surface.
- Keep the primary action near its state and prerequisite explanation. Reserve the pale accent for the main buy link and review confirmation.
- Use the runtime configuration and ABI-backed reads for financial values. Keep simulation and eligibility gating in every transaction path.
- Preserve the exact slogan, token units and fee split. Show **Connect wallet** for disconnected wallet data and **After setup** for an undeployed module.
- Keep explanatory text sentence case, with short labels and explicit amounts. Avoid decorative banners, new font families or unrelated cards.
- Add new actions through `Tx`, provide a descriptive review, and validate their connected, wrong-chain, rejection and overflow states before export.

Design guidance attribution and licenses are in [`licenses/`](licenses/). The consolidated six-domain review and observed fixes are in [VALIDATION.md](VALIDATION.md).
