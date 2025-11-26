# Flow DCA Frontend Guide

## 🎨 Design System

### Color Palette

**Primary Colors:**
- Flow Green: `#00EF8B` (Primary actions, highlights, gradients)
- Flow Green Dark: `#00D57A` (Hover states)
- Flow Green Light: `#7FFFC4` (Gradient accents)

**Base Colors:**
- White: `#FFFFFF` (Light mode background)
- Black: `#0A0A0A` (Dark mode background)
- Card Background: `#FFFFFF` / `#1A1A1A` (Context-aware)
- Border: `#E5E5E5` / `#2A2A2A` (Context-aware)

**Status Colors:**
- Success: `#00EF8B` (Flow Green)
- Error: `#FF4444`
- Warning: `#FFA500`

### Typography

- **Headings**: Geist Sans (var(--font-geist-sans))
- **Body**: Geist Sans with system fallbacks
- **Numbers/Code**: Geist Mono (var(--font-geist-mono))

### Component Patterns

**Buttons:**
```tsx
// Primary Action
<button className="bg-[#00EF8B] hover:bg-[#00D57A] text-black font-bold px-6 py-3 rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-[#00EF8B]/30">
  Create Plan
</button>

// Secondary Action
<button className="px-4 py-2 bg-gray-100 dark:bg-[#2a2a2a] hover:bg-gray-200 dark:hover:bg-[#3a3a3a] rounded-lg text-sm font-medium">
  Cancel
</button>
```

**Input Fields:**
```tsx
<input className="w-full px-4 py-3 bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl focus:border-[#00EF8B] focus:ring-2 focus:ring-[#00EF8B]/20 outline-none" />
```

**Cards:**
```tsx
<div className="bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-6 hover:border-[#00EF8B] transition-all">
  {/* Content */}
</div>
```

## 📱 Responsive Breakpoints

Using Tailwind CSS default breakpoints:

- **sm**: 640px (Small tablets)
- **md**: 768px (Tablets)
- **lg**: 1024px (Small laptops)
- **xl**: 1280px (Desktops)
- **2xl**: 1536px (Large desktops)

## 🧩 Components

### DCAHeader

**Location:** `src/components/dca/header.tsx`

**Features:**
- Sticky positioning with backdrop blur
- Flow green logo with glow effect
- Wallet connection button
- Connected state with address display
- Balance display
- Responsive mobile menu (future)

### CreateDCAPlan

**Location:** `src/components/dca/create-plan.tsx`

**Form Fields:**
1. **Investment Amount**
   - Type: Number input
   - Min: 1 FLOW
   - Step: 0.01
   - Validation: Required

2. **Investment Frequency**
   - Type: Button group
   - Options: Daily (1 day), Weekly (7 days), Bi-weekly (14 days), Monthly (30 days)
   - Default: Weekly

3. **Maximum Executions**
   - Type: Number input
   - Optional
   - Shows estimated duration

4. **Slippage Tolerance**
   - Type: Range slider
   - Min: 0.1%
   - Max: 5%
   - Default: 1%
   - Step: 0.1%

**Summary Card:**
- Real-time calculation of:
  - Per investment amount
  - Frequency
  - Total investment (if max executions set)
  - Estimated duration

**Info Panel:**
- Educational content about how DCA works
- Flow Scheduled Transactions explanation

### DCADashboard

**Location:** `src/components/dca/dashboard.tsx`

**Stats Overview:**
- Active Plans count
- Total Invested (aggregated)
- Total Acquired (aggregated)

**Plan Cards:**
- Plan ID and amount/frequency
- Status badge (Active/Paused/Completed)
- Progress bar (if max executions set)
- Metrics grid:
  - Total Invested
  - Total Acquired
  - Average Price
  - Next Execution date
- Manage button

**Empty State:**
- Dashed border card
- Icon illustration
- Call-to-action message

## 🔌 Integration Points

### Wallet Connection

**TODO:** Integrate with FCL (Flow Client Library)

```tsx
import * as fcl from "@onflow/fcl";

const connectWallet = async () => {
  await fcl.authenticate();
  const user = await fcl.currentUser().snapshot();
  setUserAddress(user.addr);
  setIsConnected(true);
};

const disconnectWallet = () => {
  fcl.unauthenticate();
  setIsConnected(false);
  setUserAddress("");
};
```

### Create DCA Plan

**TODO:** Send transaction to blockchain

```tsx
import * as fcl from "@onflow/fcl";

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const transactionId = await fcl.mutate({
    cadence: `
      import "DCAController"
      import "DCAPlan"

      transaction(amount: UFix64, intervalDays: UInt64, slippageBps: UInt64, maxExecutions: UInt64?) {
        // ... transaction code
      }
    `,
    args: (arg, t) => [
      arg(amount, t.UFix64),
      arg(intervalDays, t.UInt64),
      arg(slippageBps, t.UInt64),
      arg(maxExecutions, t.Optional(t.UInt64))
    ],
    proposer: fcl.authz,
    payer: fcl.authz,
    authorizations: [fcl.authz],
    limit: 999
  });

  await fcl.tx(transactionId).onceSealed();
};
```

### Query Plans

**TODO:** Fetch plans from blockchain

```tsx
import * as fcl from "@onflow/fcl";

const fetchPlans = async (address: string) => {
  const result = await fcl.query({
    cadence: `
      import "DCAController"

      access(all) fun main(address: Address): [DCAPlan.PlanDetails] {
        // ... script code
      }
    `,
    args: (arg, t) => [arg(address, t.Address)]
  });

  setPlans(result);
};
```

## 🚀 Running the Frontend

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

### Build for Production

```bash
# Create production build
npm run build

# Start production server
npm start
```

### Environment Variables

Create `.env.local`:

```env
# Flow Network Configuration
NEXT_PUBLIC_FLOW_NETWORK=testnet
NEXT_PUBLIC_ACCESS_NODE=https://rest-testnet.onflow.org

# Contract Addresses
NEXT_PUBLIC_DCA_CONTROLLER_ADDRESS=0x...
NEXT_PUBLIC_DCA_PLAN_ADDRESS=0x...
NEXT_PUBLIC_DCA_HANDLER_ADDRESS=0x...
```

## 📦 Dependencies

Current dependencies from package.json:

```json
{
  "@onflow/fcl": "^1.x.x",
  "@onflow/react-sdk": "^1.x.x",
  "next": "15.x.x",
  "react": "^19.x.x",
  "react-dom": "^19.x.x",
  "tailwindcss": "^4.x.x"
}
```

## 🎯 User Flow

### New User Onboarding

1. **Landing** → User sees hero section explaining DCA
2. **Connect Wallet** → Click "Connect Wallet" in header
3. **Dashboard** → View empty state with call-to-action
4. **Create Plan** → Switch to "Create Plan" tab
5. **Fill Form** → Enter amount, frequency, slippage
6. **Review Summary** → Check calculated totals
7. **Submit** → Create plan transaction
8. **Confirmation** → See success message
9. **Dashboard** → View new plan in dashboard

### Returning User Experience

1. **Auto-Connect** → Wallet reconnects automatically
2. **Dashboard** → See existing plans and stats
3. **Monitor** → Track progress and next execution
4. **Manage** → Pause, resume, or cancel plans
5. **Create More** → Add additional DCA strategies

## 🔧 Customization

### Changing Colors

Update `src/app/globals.css`:

```css
:root {
  --flow-green: #00EF8B;
  --flow-green-dark: #00D57A;
  --flow-green-light: #7FFFC4;
}
```

### Adding Token Support

Update `CreateDCAPlan.tsx`:

```tsx
const [targetToken, setTargetToken] = useState("Beaver");

const tokenOptions = [
  { value: "Beaver", label: "Beaver Token" },
  { value: "USDC", label: "USD Coin" },
  // Add more tokens
];
```

### Custom Intervals

Update `CreateDCAPlan.tsx`:

```tsx
const intervalOptions = [
  { value: "1", label: "Daily", seconds: 86400 },
  { value: "7", label: "Weekly", seconds: 604800 },
  { value: "custom", label: "Custom", seconds: 0 }, // New option
];
```

## 📊 State Management

Currently using React `useState` for local component state. For larger applications, consider:

- **Zustand** - Lightweight state management
- **React Query** - Server state management
- **SWR** - Data fetching hooks

## ♿ Accessibility

- Semantic HTML elements
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus visible states
- Color contrast WCAG AA compliant
- Screen reader friendly

## 🧪 Testing (Future)

Recommended testing stack:

```bash
# Unit/Component Tests
npm install --save-dev @testing-library/react @testing-library/jest-dom

# E2E Tests
npm install --save-dev @playwright/test

# Run tests
npm test
npm run test:e2e
```

## 📈 Performance Optimizations

- **Code Splitting** - Automatic with Next.js App Router
- **Image Optimization** - Next.js Image component
- **Font Optimization** - next/font with Geist fonts
- **CSS-in-JS** - Tailwind for minimal runtime
- **Lazy Loading** - Components loaded on demand

## 🐛 Troubleshooting

### Wallet Not Connecting

1. Check FCL configuration in `flow.json`
2. Verify network is correct (testnet/mainnet)
3. Clear browser cache and reconnect

### Styles Not Applying

1. Check Tailwind CSS import in `globals.css`
2. Verify `tailwind.config.ts` content paths
3. Restart dev server

### TypeScript Errors

1. Run `npm install` to install types
2. Check `tsconfig.json` configuration
3. Restart IDE/TypeScript server

## 📚 Resources

- **Flow Docs**: https://developers.flow.com
- **FCL Guide**: https://developers.flow.com/tools/clients/fcl-js
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Next.js**: https://nextjs.org/docs

## 🎨 Design Assets

Logo and branding assets can be found in the `public` directory (to be added):

- `logo.svg` - Flow DCA logo
- `favicon.ico` - Browser icon
- `og-image.png` - Social sharing image

---

**Built with ❤️ for the Flow community**
