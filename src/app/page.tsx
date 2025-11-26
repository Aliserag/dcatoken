"use client";

import { useState } from "react";
import { DCAHeader } from "@/components/dca/header";
import { CreateDCAPlan } from "@/components/dca/create-plan";
import { DCADashboard } from "@/components/dca/dashboard";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"create" | "dashboard">(
    "dashboard"
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#00EF8B]/5 to-white dark:from-[#0a0a0a] dark:via-[#00EF8B]/10 dark:to-[#0a0a0a]">
      <DCAHeader />

      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12 pt-8">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-[#00EF8B] via-[#7FFFC4] to-[#00EF8B] bg-clip-text text-transparent">
            Dollar-Cost Averaging
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Automate your Flow investments with smart, scheduled transactions.
            Reduce risk and build wealth over time.
          </p>

          {/* Feature Pills */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            <div className="flex items-center gap-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] rounded-full px-4 py-2">
              <svg
                className="w-5 h-5 text-[#00EF8B]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium">Automated Execution</span>
            </div>

            <div className="flex items-center gap-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] rounded-full px-4 py-2">
              <svg
                className="w-5 h-5 text-[#00EF8B]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="text-sm font-medium">Secure & Transparent</span>
            </div>

            <div className="flex items-center gap-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] rounded-full px-4 py-2">
              <svg
                className="w-5 h-5 text-[#00EF8B]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <span className="text-sm font-medium">Track Performance</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-white dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-[#2a2a2a] rounded-xl p-1">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === "dashboard"
                  ? "bg-[#00EF8B] text-black shadow-lg shadow-[#00EF8B]/30"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                  />
                </svg>
                Dashboard
              </div>
            </button>

            <button
              onClick={() => setActiveTab("create")}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === "create"
                  ? "bg-[#00EF8B] text-black shadow-lg shadow-[#00EF8B]/30"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Create Plan
              </div>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="mb-16">
          {activeTab === "dashboard" ? <DCADashboard /> : <CreateDCAPlan />}
        </div>

        {/* Footer */}
        <footer className="border-t border-gray-200 dark:border-[#2a2a2a] pt-8 mt-16">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span>Powered by</span>
              <span className="font-bold text-[#00EF8B]">Flow Blockchain</span>
              <span>•</span>
              <span>Cadence 1.0</span>
              <span>•</span>
              <span>Forte Features</span>
            </div>

            <div className="flex items-center justify-center gap-6">
              <a
                href="https://developers.flow.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#00EF8B] transition-colors"
              >
                Documentation
              </a>
              <a
                href="https://github.com/onflow"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#00EF8B] transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://discord.gg/flow"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#00EF8B] transition-colors"
              >
                Discord
              </a>
            </div>

            <p className="text-xs text-gray-500">
              Educational project demonstrating Scheduled Transactions & DeFi
              Actions
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
