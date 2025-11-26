"use client";

import { useEffect, useState } from "react";
import { fcl } from "@/lib/flow-config";

export default function Home() {
  const [user, setUser] = useState({ loggedIn: false, addr: "" });

  useEffect(() => {
    fcl.currentUser.subscribe(setUser);
  }, []);

  const logIn = () => {
    fcl.authenticate();
  };

  const logOut = () => {
    fcl.unauthenticate();
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <div className="w-full max-w-6xl">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-bold text-flow-green mb-2">DCA Token</h1>
            <p className="text-gray-400">Automated Dollar Cost Averaging on Flow</p>
          </div>
          <div>
            {user.loggedIn ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-400">
                  {user.addr.substring(0, 6)}...{user.addr.substring(user.addr.length - 4)}
                </span>
                <button
                  onClick={logOut}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={logIn}
                className="px-6 py-3 bg-flow-green hover:bg-flow-green/80 text-black font-semibold rounded-lg transition"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </header>

        {/* Hero Section */}
        <section className="mb-16 p-8 bg-gradient-to-r from-flow-blue/20 to-flow-green/20 rounded-2xl border border-flow-green/30">
          <h2 className="text-3xl font-bold mb-4">
            Automate Your Crypto Investments
          </h2>
          <p className="text-lg text-gray-300 mb-6 max-w-3xl">
            Set up recurring purchases of your favorite tokens on Flow. Using Forte Scheduled
            Transactions and Flow Actions with IncrementFi, your investments run automatically
            on-chain.
          </p>
          <div className="grid grid-cols-3 gap-6 mt-8">
            <div className="p-6 bg-black/30 rounded-xl">
              <div className="text-2xl mb-2">📅</div>
              <h3 className="font-semibold mb-2">Schedule Purchases</h3>
              <p className="text-sm text-gray-400">
                Daily, weekly, or custom intervals
              </p>
            </div>
            <div className="p-6 bg-black/30 rounded-xl">
              <div className="text-2xl mb-2">🔄</div>
              <h3 className="font-semibold mb-2">Automatic Execution</h3>
              <p className="text-sm text-gray-400">
                Runs on-chain without your intervention
              </p>
            </div>
            <div className="p-6 bg-black/30 rounded-xl">
              <div className="text-2xl mb-2">📊</div>
              <h3 className="font-semibold mb-2">Track Performance</h3>
              <p className="text-sm text-gray-400">
                Monitor average price and returns
              </p>
            </div>
          </div>
        </section>

        {/* Main Content */}
        {user.loggedIn ? (
          <section>
            <h2 className="text-2xl font-bold mb-6">Your DCA Plans</h2>
            <div className="p-8 bg-white/5 rounded-xl border border-gray-700">
              <p className="text-gray-400 text-center">
                No plans yet. Create your first DCA plan to get started.
              </p>
              <div className="mt-6 text-center">
                <button className="px-6 py-3 bg-flow-blue hover:bg-flow-blue/80 rounded-lg font-semibold transition">
                  Create DCA Plan
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="text-center py-16">
            <p className="text-xl text-gray-400 mb-6">
              Connect your wallet to view and manage your DCA plans
            </p>
            <button
              onClick={logIn}
              className="px-8 py-4 bg-flow-green hover:bg-flow-green/80 text-black font-bold text-lg rounded-lg transition"
            >
              Get Started
            </button>
          </section>
        )}

        {/* Features */}
        <section className="mt-16 grid grid-cols-2 gap-8">
          <div className="p-6 bg-white/5 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold mb-3">🚀 Forte Scheduled Transactions</h3>
            <p className="text-gray-400">
              Powered by Flow's native scheduled transaction system. Your DCA executes
              automatically without needing to sign each transaction.
            </p>
          </div>
          <div className="p-6 bg-white/5 rounded-xl border border-gray-700">
            <h3 className="text-xl font-semibold mb-3">🧩 Flow Actions</h3>
            <p className="text-gray-400">
              Composable DeFi actions from the Flow Actions framework. Seamlessly swap
              tokens through IncrementFi with built-in slippage protection.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-gray-800 text-center text-sm text-gray-500">
          <p>Educational Demo • Built with Cadence 1.0 • Flow Forte Features</p>
          <p className="mt-2">Default Pair: FLOW → Beaver via IncrementFi</p>
        </footer>
      </div>
    </main>
  );
}
