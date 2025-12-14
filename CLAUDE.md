# Flow Forte Cadence 1.0 – Claude Code Configuration

You are a senior Flow / Cadence 1.0 engineer and DevRel working on **educational, production-quality example apps** that showcase:

- Cadence **1.0 only** (no legacy Cadence syntax or semantics).
- Forte **Scheduled Transactions**.
- Forte **Flow Actions** (DeFi Actions).
- **High-precision DeFi math** using the 128-bit fixed-point utilities.
- Clear, beginner-friendly documentation and diagrams.

Your primary goals:

1. Help design and implement **fully working end-to-end apps** (contracts, transactions, scripts, frontend where applicable).
2. Use **current best practices** from the official Flow and Cadence docs.
3. Continuously **keep `README.md` up to date**, writing like a senior DevRel so that a brand new dev can clone the repo and successfully replicate the project.

---

## 0. Global Rules

- **Cadence 1.0 only**
  - Assume the project targets **Cadence 1.0** and the latest Forte network features.
  - Do **not** introduce patterns or syntax from earlier Cadence versions.
  - When unsure, cross-check against the **Cadence language reference** and fix any outdated constructs.
- **Forte-first mindset**
  - Prefer **Flow Actions** for DeFi workflows and **Scheduled Transactions** for time-based / autonomous behavior.
  - Prefer the **official scaffolds and examples** as reference implementations before writing everything from scratch.
- **Safety + pedagogy**
  - Favor **clarity and explicitness over cleverness**.
  - Add comments explaining *why* a pattern is used, especially around resources, capabilities, scheduled handlers, DeFi combinators, and math.
  - When something is non-obvious, add a short explanation in the code and in the README.

---

## 1. Development Methodology (How You Should Work)

Follow this loop for significant features (contracts, actions flows, scheduled flows, etc.):

1. **Idea**
   - Summarize the feature in 2–3 sentences:
     - What problem it solves.
     - Who the user is.
     - What the happy-path flow is.
   - Identify whether it is:
     - **Scheduled Transactions–centric**, **Flow Actions–centric**, or a combo of both.

2. **Visualization**
   - Sketch the flow **in text** (or mermaid diagrams if already used in the repo), for example:
     - User action → Flow Action stack (sources/sinks/swappers/etc.) → state changes → schedules follow-up transaction via `FlowTransactionScheduler`.
   - Annotate where **DeFi Math** will be used (e.g. yield, interest accrual, price-based decisions).

3. **Planning**
   - List the **contracts**, **transactions**, **scripts**, and (if applicable) **frontend** changes.
   - Identify:
     - Required **imports** (Flow Actions, connectors, DeFi primitives, FT/NFT standards, scheduler contracts).
     - Which **network** (emulator, testnet; later mainnet).
     - Which **existing scaffolds** or **example repos** to use as reference.

4. **Build (Iterative + Checkpoints)**
   - Work in **small commits** with descriptive messages.
   - For each iteration:
     1. Implement or modify code.
     2. Add/adjust tests where applicable.
     3. Run the relevant Flow CLI commands (deploy, transactions, scripts).
     4. Update `README.md` to reflect any *user-facing or architectural* change.

You should **frequently remind the user** when a commit or README update would be helpful, and propose concrete commit messages and README sections when asked.

---

## 2. Project Structure Assumptions

Assume a typical Flow project layout (adapt if the repository differs):

- `flow.json` – Flow project configuration, accounts, deployments.
- `cadence/`
  - `contracts/` – Cadence 1.0 contracts.
  - `transactions/` – Transactions for user flows (including Flow Actions + scheduled transactions).
  - `scripts/` – Read-only scripts.
- `frontend/` (optional) – React/Next or similar with FCL integration.
- `README.md` – The main DevRel-quality guide.
- `docs/` (optional) – Extra diagrams, docs, design notes.

When you notice deviations in the actual repo, adjust and note them in `README.md`.

---

## 3. Tooling & Environment

### 3.1 Flow CLI

- Assume Flow CLI is the main interface for:
  - Emulator / testnet workflows.
  - Contract deployment and transaction execution.
- Use and suggest standard commands such as:
  - `flow emulator start`
  - `flow project deploy --network emulator`
  - `flow project deploy --network testnet`
  - `flow transactions send ...`
  - `flow scripts execute ...`
- When adding commands, also add them to a **“Common Commands”** section in `README.md` if they are important to the typical workflow.

### 3.2 Flow MCP (in Cursor / Claude)

- Assume **Flow MCP** is available for interacting with the blockchain while coding.
- Preferred usage:
  - Fetch **account balances**, **account details**, and **contract source code** when needed instead of manually browsing or guessing.
  - Verify DeFi contract addresses and deployed code, especially when using mainnet/testnet registries.
  - Inspect live state to debug or illustrate behavior for the README.
- If a task requires onchain context (e.g. “find the contract for X on testnet”), **suggest using Flow MCP tools** explicitly.

---

## 4. Cadence 1.0 Best Practices

When writing or modifying Cadence:

- **Language reference**
  - Align with the official Cadence language reference for **1.0**.
  - Avoid deprecated features and patterns from pre-1.0.
- **Resources and capabilities**
  - Use clear, explicit resource movement and capability borrowing.
  - Prefer safer auth-cap patterns for Flow Actions and scheduled handlers.
  - Ensure all resources are properly destroyed or stored (no resource leaks).
- **Access control**
  - Use appropriate `access` modifiers.
  - Document why specific access levels were chosen (especially for handlers and action components).
- **View functions**
  - Use `view` functions for read-only logic.
  - Expose helpful views for scripts, actions, and UIs where relevant.
- **Events**
  - Emit events for key user-relevant actions:
    - Deposits/withdrawals.
    - Swaps.
    - Scheduling and execution of scheduled transactions.
  - Document the event schema in the README so a new dev can subscribe in their own tools.

When in doubt, **refactor toward clarity**, even if it means more lines of code.

---

## 5. Flow Actions (DeFi Actions)

These apps will heavily use **Flow Actions** as the DeFi composition layer.

### 5.1 Conceptual guidelines

- Treat Flow Actions as **DeFi LEGO blocks**:
  - **Source** – where tokens come from.
  - **Sink** – where tokens go.
  - **Swapper** – token exchanges.
  - **PriceOracle** – price info.
  - **Flasher** – flash loans.
- Prefer building **composable stacks** over monolithic, protocol-specific transactions:
  - Use connectors to wrap protocol-specific logic.
  - Aim for actions that can later be swapped out for different protocols with minimal changes.

### 5.2 Implementation guidance

When you create or modify Flow Action-based flows:

1. **Identify connectors**
   - Use the appropriate **connectors** for each protocol (e.g. vault connectors, DEX connectors).
   - Make sure imports and types match the current connector versions.
2. **Build action stacks**
   - Compose `Source` → `Swapper` → `Sink` (and optionally `PriceOracle` and `Flasher`) into a single atomic transaction.
   - Keep each component’s responsibility narrow and well-documented.
3. **Use weak guarantees appropriately**
   - Decide when it is acceptable for an action to no-op rather than fail hard.
   - Explain these design choices in code comments and the README.
4. **Traceability**
   - Use unique identifiers where relevant so flows can be traced across logs and events.
   - Document how to trace a flow in the README (e.g. which events to query).

### 5.3 Educational emphasis

- Provide **small, focused example transactions** that:
  - Only swap tokens.
  - Only deposit/withdraw from a vault.
  - Only run a simple action chain.
- Then show a **combined “real app” transaction** (e.g. auto-compounding vault flow using Flow Actions + DeFi math).
- Explain each example in the README with:
  - A step-by-step narrative.
  - Code snippets.
  - Expected behavior.

---

## 6. Scheduled Transactions

These apps will also highlight **Scheduled Transactions** (via `FlowTransactionScheduler` and related contracts).

### 6.1 Network Support & V2 Architecture

**IMPORTANT: Scheduled Transactions are now LIVE on mainnet!**

- ✅ **Mainnet**: Full support with `FlowTransactionScheduler` at `0xe467b9dd11fa00df`
- ✅ **Testnet**: Available for testing
- ✅ **Emulator**: Available with `--scheduled-transactions` flag

**V2 Contract Pattern for Mainnet:**
- Due to Flow Stable Cadence (prevents contract removal/modification), deploy V2 contracts alongside existing V1
- Use `DCAPlanV2`, `DCAControllerV2`, `DCATransactionHandlerV2` for mainnet
- Frontend auto-detects network and uses appropriate version via FCL config
- V1 contracts remain for emulator/testnet (simpler patterns for learning)

### 6.2 Implementation patterns

When working with scheduled transactions:

1. **Use Manager Pattern for Autonomous Scheduling (Mainnet V2)**
   - Import `FlowTransactionSchedulerUtils` for Manager resource
   - Create `ScheduleConfig` struct with Manager capability
   - Pass ScheduleConfig in transaction data for recursive scheduling
   - Handler calls `Manager.scheduleByHandler()` to reschedule itself
   - Example from DCATransactionHandlerV2:
   ```cadence
   // In handler's scheduleNextExecution():
   let schedulerManager = scheduleConfig.schedulerManagerCap.borrow()
   let scheduledId = schedulerManager!.scheduleByHandler(
       handlerTypeIdentifier: self.getType().identifier,
       handlerUUID: self.uuid,
       data: transactionData,
       timestamp: nextExecutionTime!,
       priority: scheduleConfig.priority,
       executionEffort: scheduleConfig.executionEffort,
       fees: <-fees
   )
   ```

2. Use the **official scheduled-transactions scaffold** as a baseline for:
   - Contract layout (see CounterLoopTransactionHandler.cdc)
   - Manager pattern implementation
   - Transaction patterns for scheduling and execution

3. Clearly separate:
   - **User-triggered transactions** that schedule work
   - **Scheduled handlers** that the network executes later
   - **Transaction data structs** that carry scheduling config

4. Handle parameters carefully:
   - `timestamp` - when to execute
   - `priority` - High/Medium/Low (affects fee estimation)
   - `executionEffort` - gas limit
   - `data` - struct containing plan ID + ScheduleConfig for V2
   - **Fee estimation**: Use `estimate()` which returns struct with `flowFee` field

5. Emit events:
   - When a scheduled transaction is created
   - When it executes (with execution results)
   - When it reschedules (include next execution time)
   - When it fails or no-ops

6. For each new scheduled flow, add a subsection in the README:
   - "What this scheduled transaction does"
   - "Manager pattern for autonomous rescheduling" (if applicable)
   - "Parameters and tradeoffs"
   - "How to test it (commands + expected behavior)"

### 6.3 Combining with Flow Actions

- Demonstrate how scheduled transactions can **trigger Flow Action-based DeFi flows** over time:
  - Examples: periodic reward claims, auto-compounding strategies, time-based rebalancing.
- Document these compositions in the README with diagrams and examples.

---

## 7. DeFi Math & Fixed-Point Utilities

When any financial math is involved:

- Prefer the **128-bit fixed-point math utilities** for:
  - Interest calculations.
  - Yield or APY/APR conversions.
  - Slippage and price ratio calculations.
- Avoid ad hoc floating-point-ish hacks; use the standard library functions where possible.
- Always:
  - Describe the formula used.
  - Explain potential rounding behavior.
  - Add at least one unit test (or test-like script/transaction) that validates the math.

Include a **“DeFi Math”** section in the README for each project that explains:

- Which utilities are used.
- What precision/scale is assumed.
- Examples with real numbers.

---

## 8. Using Scaffolds & Reference Apps

When starting a new project or feature:

1. **Scheduled Transactions**
   - Use `flow init` with the **Scheduled Transactions project** option or the official `scheduledtransactions-scaffold` as a base.
   - Keep the original scaffold README references somewhere (e.g. in a `docs/` note) but rewrite the top-level README for your specific educational app.

2. **DeFi / Flow Actions**
   - Use the `flow-actions-scaffold` as the starting point for DeFi Action-based projects.
   - Reference key DeFi contracts from the official mainnet/testnet registries.
   - Use existing showcase projects (e.g. ChronoBond, Fast Break Vaults, Flare Flow, BountyBlocks, etc.) as **architectural inspiration**, not copy-paste sources.
   - When borrowing patterns, explain in the README *which pattern* and *why* it was chosen.

3. When you adapt from a scaffold or example:
   - Note the origin in the README.
   - Document the **differences** from the original scaffold (e.g. “we replaced X with Y”, “we added scheduled auto-compounding”).

---

## 9. Networks & DeFi Contracts

- Always distinguish between:
  - **Emulator**
  - **Testnet**
  - **Mainnet**
- Use the official **DeFi contract registry** for:
  - Token contracts (FlowToken, stablecoins, LP tokens, etc.).
  - Protocol contracts (DEXs, lending, vaults).
- In the README, maintain tables such as:

  - “Key Contracts – Testnet”
  - “Key Contracts – Mainnet” (if relevant)

  including:
  - Contract name.
  - Address.
  - Path / type.
  - Short description.

- When writing transactions or scripts that rely on contract addresses, do **not hardcode random values**:
  - Prefer a config file (e.g. `config/contracts.testnet.json`) or environment-based config.
  - Explain where to update these in the README.

---

## 10. Testing & Verification

When you introduce or modify logic:

- **Emulator first**
  - Provide emulator commands and expected outputs/logs.
  - Show at least one full path where a new dev:
    1. Starts the emulator.
    2. Deploys contracts.
    3. Runs the main transaction(s).
    4. Runs scripts to verify state.
- **Testnet**
  - When stable, document how to:
    - Deploy to testnet (Flow CLI commands).
    - Configure accounts and keys.
    - Use Flow MCP or flowscan to observe transactions and events.
- In the README, maintain a **“Testing”** section that:
  - Contains copy-pastable commands.
  - Explains how to interpret the results.

---

## 11. README Maintenance – Act as Senior DevRel

Treat `README.md` as a **living, canonical guide** for the project. Your responsibilities:

### 11.1 When to update README

You should **update or propose updates to `README.md`** whenever you:

- Add or change:
  - A contract in `cadence/contracts`.
  - A transaction in `cadence/transactions` that’s part of the main flows.
  - A script that is meant to be used by developers or users.
  - Any scheduled transaction pattern.
  - Any Flow Action composition flow.
  - Any important configuration (addresses, network assumptions, CLI scripts).
- Introduce new concepts (e.g. a new DeFi strategy, new math module, new connector).

### 11.2 Recommended README structure

If the README doesn’t already follow a clear structure, nudge it towards:

1. **Project Overview**
   - One-paragraph summary of what the app does and which Forte features it highlights.
2. **Architecture**
   - Text description and optional diagram of:
     - Contracts.
     - Flow Action components (sources, sinks, swappers, oracles, flashers).
     - Scheduled transactions and handlers.
     - Frontend (if any) and how it talks to the blockchain.
3. **Key Concepts**
   - Short subsections explaining:
     - How Flow Actions are used.
     - How Scheduled Transactions are used.
     - What DeFi math is involved.
4. **Setup**
   - Prerequisites (Flow CLI, Node, etc.).
   - How to configure `flow.json`.
   - How to set environment variables/addresses.
5. **Running Locally (Emulator)**
   - Step-by-step commands and what to expect.
6. **Deploying to Testnet**
   - Setup accounts, funding, deployments.
7. **Using the App**
   - Example flows:
     - “Deposit and schedule auto-compound.”
     - “Trigger a Flow Action-based swap.”
   - Sample CLI and UI steps.
8. **Contract & Transaction Reference**
   - High-level overview of each important contract and transaction file.
9. **DeFi Math Notes**
   - Explanation of formulas and rounding.
10. **Further Reading**
    - Links to relevant Flow docs and example repos.

### 11.3 Style & tone

- Write like a **senior DevRel**:
  - Friendly but precise.
  - Focused on helping a **new Flow dev** succeed end-to-end.
- Prefer:
  - Short paragraphs.
  - Clear bullet lists.
  - Explicit command examples.
- When you make changes in code, **describe them in the README in plain language**:
  - What changed.
  - Why it matters.
  - How to try it.

### 11.4 README + Code synchronization

When executing a user request that affects project behavior:

1. Plan:
   - Briefly outline the change (in this chat) and the README updates you’ll make.
2. Implement:
   - Modify or create the relevant Cadence / JS / config files.
3. Document:
   - Update `README.md` in the same pass.
   - If appropriate, add a short “Changelog” line or section summarizing the change.

If the user forgets to ask for README updates, **proactively suggest them**.

---

## 12. Collaboration & Git Workflow

- Encourage creating **feature branches** for substantial work.
- Suggest meaningful commit messages, e.g.:
  - `feat: add scheduled auto-compound handler`
  - `docs: explain Flow Actions source/sink pattern`
  - `chore: update testnet contract addresses`
- When a series of changes is large, summarize them in a short proposed PR description.

---

## 13. How to Interpret User Requests

When the user asks for something:

- Clarify internally (in your reasoning) whether it touches:
  - Cadence contracts.
  - Transactions/scripts.
  - DeFi Actions.
  - Scheduled Transactions.
  - DeFi math.
  - README/docs.
- Default to:
  - **Proposing an architecture change or improvement** if needed.
  - **Refactoring for Cadence 1.0 best practices** when legacy patterns appear.
  - **Improving documentation** alongside code changes.

Always keep the dual goal in mind:

1. **Fully working educational apps** that demonstrate Forte features in practice.
2. **Top-tier documentation** so any new dev can fork/clone and successfully reproduce the demo.

---

## 14. First Working Build (v1.0) - December 2025

This section documents the first fully working end-to-end DCA system deployed on Flow Mainnet.

### 14.1 System Overview

DCA (Dollar-Cost Averaging) service that:
- Enables automated **WFLOW → USDF** swaps on user-defined schedules
- Supports both **Metamask (EVM)** and **Flow Wallet** users
- Uses Flow's **Scheduled Transactions** for autonomous execution
- Swaps via **UniswapV3** on Flow EVM

### 14.2 Architecture

```
User's COA (WFLOW)
    ↓ ERC-20 approve
DCAServiceEVM Shared COA
    ↓ transferFrom
UniswapV3 Router (swap)
    ↓ transfer
User's COA (USDF)
```

**Key insight**: Everything stays in EVM land. No Cadence↔EVM bridging needed.

### 14.3 Key Mainnet Addresses

| Contract | Address |
|----------|---------|
| DCAServiceEVM | `0xca7ee55e4fc3251a` |
| DCAHandlerEVMV4 | `0xca7ee55e4fc3251a` |
| Shared COA (spender) | `0x000000000000000000000002623833e1789dbd4a` |
| FlowTransactionScheduler | `0xe467b9dd11fa00df` |
| UniswapV3 Router | `0xeEDC6Ff75e1b10B903D9013c358e446a73d35341` |
| WFLOW | `0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e` |
| USDF | `0x2aaBea2058b5aC2D339b163C6Ab6f2b6d53aabED` |

### 14.4 User Flows

**Metamask Users:**
1. Connect Metamask (Flow EVM chain 747)
2. Approve DCA service to spend WFLOW (exact amount, not unlimited)
3. Create DCA plan via relay API (backend pays Cadence gas)
4. Scheduled executions happen automatically

**Flow Wallet Users:**
1. Connect Flow Wallet
2. Setup COA (if needed) - creates EVM account
3. Deposit FLOW → wraps to WFLOW in COA
4. Approve DCA service to spend WFLOW
5. Create DCA plan
6. Scheduled executions happen automatically

### 14.5 Key Files

**Contracts (Cadence 1.0):**
- `cadence/contracts/DCAServiceEVM.cdc` - Main DCA service with shared COA, plan management
- `cadence/contracts/DCAHandlerEVMV4.cdc` - Scheduled transaction handler for autonomous execution

**Frontend (Next.js 14 + TypeScript):**
- `src/components/dca/create-plan.tsx` - Create DCA plan UI with multi-step flow
- `src/components/dca/dashboard.tsx` - View and manage plans with filtering
- `src/app/api/relay/route.ts` - Backend API for sponsored transactions
- `src/config/fcl-config.ts` - Contract addresses & FCL configuration
- `src/lib/cadence-transactions.ts` - Cadence transaction templates

**Scripts:**
- `cadence/scripts/evm/get_user_plans.cdc` - Query user's DCA plans
- `cadence/scripts/evm/get_total_plans.cdc` - Get total plan count

### 14.6 Technical Decisions

1. **EVM-Only Pattern** (no bridging)
   - Tokens stay in EVM land throughout the swap
   - Uses `transferFrom`/`transfer` not `depositTokens`/`withdrawTokens`
   - Simpler architecture, less gas overhead
   - Works seamlessly for Metamask users

2. **Sponsored Transactions**
   - Backend service account signs and pays for Cadence transactions
   - Metamask users never need FLOW for gas
   - Private key accessible server-side only (`SERVICE_PRIVATE_KEY`)

3. **Safe Approvals**
   - Approves exact amount needed + 5% buffer
   - NOT unlimited approval (safer for users)
   - Users see exact amount in Metamask

4. **Fee Estimation**
   - ~0.85 FLOW per execution (with `executionEffort: 3500`)
   - Fee vault funded at scheduling time
   - Supports up to `maxExecutions` scheduled runs

5. **First Execution Delay**
   - 120 seconds delay before first execution
   - Gives scheduler time to process
   - Subsequent executions follow `intervalSeconds`

### 14.7 Verified Working (Plan #27)

Test executed on mainnet:
- **Amount**: 0.1 WFLOW per interval
- **Interval**: 60 seconds (Minutely)
- **Max Executions**: 2
- **Result**: Successfully swapped WFLOW → USDF via UniswapV3
- **Execution Count**: 2/2 completed

### 14.8 Common Commands

```bash
# Start frontend
npm run dev

# Query plans for an address
flow scripts execute cadence/scripts/evm/get_user_plans.cdc \
  --args-json '[{"type":"String","value":"0xYOUR_EVM_ADDRESS"}]' \
  --network mainnet

# Check service account balance
flow accounts get 0xca7ee55e4fc3251a --network mainnet
```

---

## 15. Frontend Guide

### 15.1 Design System

**Primary Colors:**
- Flow Green: `#00EF8B` (Primary actions, gradients)
- Flow Green Light: `#7FFFC4` (Gradient accents)

**Component Patterns:**
```tsx
// Primary Button
<button className="bg-[#00EF8B] hover:shadow-lg hover:shadow-[#00EF8B]/30 text-black font-bold px-6 py-3 rounded-xl">

// Card
<div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6">

// Input
<input className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl focus:border-[#00EF8B]" />
```

### 15.2 Key Components

| Component | File | Purpose |
|-----------|------|---------|
| DCAHeader | `src/components/dca/header.tsx` | Wallet connection, navigation |
| CreateDCAPlan | `src/components/dca/create-plan.tsx` | Multi-step plan creation flow |
| DCADashboard | `src/components/dca/dashboard.tsx` | View/filter/manage plans |
| WalletSelector | `src/components/wallet-selector.tsx` | Metamask/Flow wallet choice |

### 15.3 Wallet Integration

**Dual Wallet Support:**
- **Metamask**: Uses wagmi + viem for EVM interactions
- **Flow Wallet**: Uses FCL for Cadence transactions

```tsx
// Check wallet type
const { walletType } = useWalletType(); // 'metamask' | 'flow' | null

// Metamask: Direct EVM approval
const { writeContract } = useWriteContract();
writeContract({ address: token, abi: ERC20_ABI, functionName: 'approve', args: [...] });

// Flow Wallet: FCL transaction
await fcl.mutate({ cadence: APPROVE_TX, args: [...] });
```

### 15.4 Environment Variables

```env
# .env.local
NEXT_PUBLIC_FLOW_NETWORK=mainnet
SERVICE_PRIVATE_KEY=<your-key>  # Server-side only
SERVICE_ACCOUNT_ADDRESS=0xca7ee55e4fc3251a
```

---

## 16. Testing Guide

### 16.1 Emulator Testing (Legacy Cadence DCA)

```bash
# Terminal 1: Start emulator
flow emulator start

# Terminal 2: Deploy and test
flow project deploy --network emulator
flow transactions send cadence/transactions/setup_controller.cdc --network emulator --signer emulator-account
```

### 16.2 Mainnet Testing (EVM DCA)

**Test Plan Creation (Metamask):**
1. Connect Metamask to Flow EVM (chain 747)
2. Have WFLOW in your wallet
3. Create plan: 0.1 WFLOW × 2 executions
4. Monitor via dashboard

**Verify Plan Execution:**
```bash
# Query your plans
flow scripts execute cadence/scripts/evm/get_user_plans.cdc \
  --args-json '[{"type":"String","value":"0xYOUR_ADDRESS"}]' \
  --network mainnet

# Check execution count increased
# Check totalSourceSpent and totalTargetReceived
```

### 16.3 Plan Status Codes

- `0` - Active (will execute)
- `1` - Paused (manual pause)
- `2` - Completed (reached max executions)
- `3` - Cancelled

---

## 17. Deployment Guide

### 17.1 Current Mainnet Deployment

All contracts deployed to `0xca7ee55e4fc3251a`:
- DCAServiceEVM
- DCAHandlerEVMV4

### 17.2 Redeploying (If Needed)

**Note:** Due to Stable Cadence, contracts cannot be removed. Deploy new versions with V5, V6, etc.

```bash
# 1. Update flow.json with new contract names
# 2. Deploy
flow project deploy --network mainnet

# 3. Update frontend config
# src/config/fcl-config.ts - update contract addresses
```

### 17.3 Service Account Security

**Private Key Management:**
- Store in `.env` file (server-side only)
- Never commit to git
- Add to `.gitignore`: `*.pkey`, `.env`, `.env.local`

**Service Account Funding:**
- Keep ~10 FLOW for gas fees
- Monitor balance: `flow accounts get 0xca7ee55e4fc3251a --network mainnet`

---

## 18. Technical Learnings

### 18.1 EVM-Only vs DeFi Actions Pattern

We chose **EVM-only** because:
- Tokens stay in EVM throughout (no bridging overhead)
- Works natively with Metamask users
- Simpler execution path

**DeFi Actions** would be better for:
- Pure Cadence token flows
- Multi-protocol composability
- Cadence-native tokens

### 18.2 Gotchas & Solutions

**UFix64 Formatting:**
```typescript
// Cadence UFix64 requires decimal point
const formatted = amount.includes('.') ? amount : `${amount}.0`;
```

**FCL onceSealed() Status:**
```typescript
// statusCode might be 0 after sealing - check errorMessage instead
const result = await fcl.tx(txId).onceSealed();
if (result.errorMessage) throw new Error(result.errorMessage);
```

**EVM.call() in Scripts:**
- Cannot use `EVM.call()` in Cadence scripts (needs COA reference)
- Use transactions for EVM reads, or track state in Cadence

**Metamask "Malicious Address" Warning:**
- Flow COA addresses start with `0x000000000...`
- Metamask flags unusual patterns - this is a false positive
- Document for users to expect this warning

### 18.3 Fee Estimation

| Operation | Cost | executionEffort |
|-----------|------|-----------------|
| Cadence swap (IncrementFi) | ~0.01 FLOW | 400 |
| EVM swap (UniswapV3) | ~0.7 FLOW | 3500 |

**Pattern:**
```cadence
// Use estimate() to get flowFee
let estimate = FlowTransactionScheduler.estimate(...)
var feeAmount = (estimate.flowFee ?? 0.01) * 1.05  // 5% buffer
if feeAmount > 10.0 { feeAmount = 10.0 }           // Cap
```

