# Canton OTC Settlement Engine

A decentralized application (dApp) for blind bilateral Over-The-Counter (OTC) block trade negotiation and settlement on the Canton Network. This project demonstrates how Canton's privacy and atomicity features can be leveraged to create a secure, efficient, and private market for institutional digital asset trading, eliminating settlement risk and pre-trade information leakage.

## Overview

Institutional OTC trading for large block sizes faces two primary challenges:
1.  **Counterparty Risk**: The risk that one party will fail to deliver on their side of the trade after the other has already delivered (also known as principal risk or settlement risk).
2.  **Information Leakage**: The risk that quoting a price or showing intent to trade will move the market price unfavorably before the trade is executed.

This project solves both problems by using Daml smart contracts on Canton:

*   **Atomic DvP Settlement**: Delivery-versus-Payment is guaranteed. The exchange of assets is an atomic, all-or-nothing transaction. It's impossible for one party to receive assets without the other party also receiving theirs simultaneously.
*   **Zero Pre-Trade Transparency**: Parties submit sealed proposals. Canton's privacy model ensures that a party's proposal is only visible to them and the network's synchronizer. A counterparty cannot see the terms of a proposal until they have committed to their own, perfectly matching proposal.

This creates a "dark pool" environment where liquidity can be sourced without revealing trading intentions to the broader market, minimizing market impact.

---

## Workflow

The core workflow is designed for simplicity and security, relying on off-ledger communication for initial coordination and on-ledger contracts for binding settlement.

1.  **Off-Ledger Negotiation**: Two trading desks (e.g., Alice's desk and Bob's desk) agree to trade a specific asset pair (e.g., wBTC/USDC). They agree on a unique `tradeId` to identify this specific transaction. All other terms (quantity, price) remain private to each party for the on-ledger phase.

2.  **Create Sealed Proposal**:
    *   Alice creates a `SealedProposal` contract on the ledger. Her proposal might be to **sell** 100 wBTC for 6,500,000 USDC. This contract is only visible to Alice.
    *   Bob, independently, creates his own `SealedProposal` contract. His proposal must be the mirror image: to **buy** 100 wBTC for 6,500,000 USDC. This contract is only visible to Bob.

3.  **Initiate Settlement**:
    *   Once both proposals are on the ledger, either party can initiate the settlement. Let's say Alice initiates.
    *   Alice exercises the `AttemptSettle` choice on her `SealedProposal`, providing the Contract ID of Bob's proposal.

4.  **Atomic Matching & Settlement**:
    *   The `AttemptSettle` choice atomically fetches both Alice's and Bob's proposals within the same transaction.
    *   The smart contract logic validates that the proposals are a perfect mirror match:
        *   Same `tradeId`.
        *   Same assets (wBTC and USDC).
        *   Same quantities (100 wBTC and 6,500,000 USDC).
        *   Opposite sides (Alice is selling wBTC, Bob is buying wBTC).
    *   **If Matched**: Both `SealedProposal` contracts are consumed and a `SettlementInstruction` contract is created. This new contract proceeds to atomically execute the DvP transfer using a standard token library.
    *   **If Mismatched**: The transaction fails. Both `SealedProposal` contracts remain on the ledger, unchanged. The parties know a mismatch occurred and can coordinate off-ledger to correct their proposals before trying again. No assets are transferred, and no sensitive data is revealed.

---

## Institutional Onboarding

Onboarding a new trading institution onto this platform involves three key steps:

1.  **Network Participation**: The institution must connect to a Canton Participant Node on the target network (e.g., DevNet, TestNet, or MainNet). This provides them with a cryptographic identity (`Party`) on the network. This is typically managed by a third-party Participant Node Operator.

2.  **Custody & Wallet Integration**: Institutional-grade custody is paramount. The platform is designed to integrate with CIP-0103 compliant wallet gateways. This allows trading desks to manage their private keys and sign transactions using their existing custody providers (e.g., Fireblocks, BitGo, DFNS) without those keys ever leaving their secure environment.

3.  **Asset Access**: The institution must hold the tokenized assets they wish to trade in their wallet. These assets must be issued on the Canton network and conform to the required token standards for DvP settlement (e.g., CIP-0056).

---

## Getting Started (for Developers)

### Prerequisites

*   **DPM (Daml Package Manager)**: Version `3.4.0` or higher. This is the official Canton SDK toolchain. Install it from [install.digitalasset.com](https://install.digitalasset.com).
*   **Java 11**: Required by the Daml sandbox.
*   **Node.js LTS**: For any future UI or integration service development.

### Local Development

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-org/canton-otc-settlement.git
    cd canton-otc-settlement
    ```

2.  **Build the Daml models**:
    This compiles the Daml code into a deployable artifact (`.dar` file).
    ```bash
    dpm build
    ```

3.  **Run the tests**:
    This executes the Daml Script tests defined in the `tests/` directory to verify the contract logic.
    ```bash
    dpm test
    ```

4.  **Start a local Canton ledger**:
    This command starts a single-node Canton network (a "sandbox") with a JSON API available on port `7575`.
    ```bash
    dpm sandbox
    ```

5.  **Interact with the contracts**:
    You can use the JSON API to create parties, submit transactions, and query the ledger state. Refer to the Daml Script tests for examples of valid transaction flows.

---

## Project Structure

```
.
├── daml/                     # Main Daml source code
│   ├── OTC/
│   │   └── Settlement.daml     # Core `SealedProposal` and settlement logic
│   └── Main.daml             # Main module, often used for script tests setup
├── tests/                    # Daml Script tests
│   └── SettlementTests.daml    # Test scenarios for the settlement workflow
├── daml.yaml                 # Daml package configuration
└── README.md                 # This file
```