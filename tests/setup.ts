/**
 * Test Setup and Utilities for DCA Testnet Testing
 *
 * Provides utilities for running Flow CLI commands, checking state,
 * and orchestrating comprehensive tests on testnet.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Network configuration
export const NETWORK = 'testnet';

// Contract addresses on testnet
export const CONTRACTS = {
  DCAServiceEVM: '0x4a22e2fce83584aa',
  DCAHandlerEVMV4: '0x4a22e2fce83584aa',
  FlowToken: '0x7e60df042a9c0868',
  FungibleToken: '0x9a0766d93b6608b7',
  FlowTransactionScheduler: '0x8c5303eaa26202d6',
  FlowTransactionSchedulerUtils: '0x8c5303eaa26202d6',
  EVM: '0x8c5303eaa26202d6',
};

// EVM Token addresses on testnet
export const EVM_TOKENS = {
  WFLOW: '0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e',
  USDF: '0xd7d43ab7b365f0d0789aE83F4385fA710FfdC98F',
  USDC: '0xd431955D55a99EF69BEb96BA34718d0f9fBc91b1',
};

// UniswapV3 Router on testnet
export const UNISWAP_ROUTER = '0x2Db6468229F6fB1a77d248Dbb1c386760C257804';

// Test accounts
export const TEST_ACCOUNTS = {
  cadence: {
    address: '0x4a22e2fce83584aa',
    keyIndex: 0,
  },
  evm: {
    address: '0xcc18e51efc529ed41e48ae5dea8fcec60a2baefe',
  },
};

// DCA COA address on testnet
export const DCA_COA_ADDRESS = '0x000000000000000000000002c058dc16c13e4e2f';

// Test result interface
export interface TestResult {
  testId: string;
  description: string;
  status: 'passed' | 'failed' | 'skipped';
  expected: string;
  actual: string;
  error?: string;
  duration?: number;
}

// Test suite interface
export interface TestSuite {
  name: string;
  results: TestResult[];
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  startTime: Date;
  endTime?: Date;
}

/**
 * Execute a Flow CLI script and return the result
 */
export async function executeScript(scriptPath: string, args: string[] = []): Promise<string> {
  const argsStr = args.map(a => `"${a}"`).join(' ');
  const cmd = `source .env && export PRIVATE_KEY_MAINNET=$PRIVATE_KEY_TESTNET && flow scripts execute ${scriptPath} ${argsStr} --network ${NETWORK} 2>&1`;

  try {
    const { stdout } = await execAsync(cmd, { cwd: '/Users/serag/Documents/GitHub/dcatoken' });
    // Extract the result from the output
    const resultMatch = stdout.match(/Result: (.+)/);
    return resultMatch ? resultMatch[1] : stdout;
  } catch (error: any) {
    throw new Error(`Script execution failed: ${error.message}`);
  }
}

/**
 * Execute a Flow CLI transaction and return the result
 */
export async function executeTransaction(
  txPath: string,
  args: string[] = [],
  signer: string = 'testnet-deployer'
): Promise<{ txId: string; events: any[]; success: boolean; error?: string }> {
  const argsStr = args.map(a => `"${a}"`).join(' ');
  const cmd = `source .env && export PRIVATE_KEY_MAINNET=$PRIVATE_KEY_TESTNET && flow transactions send ${txPath} ${argsStr} --signer ${signer} --network ${NETWORK} 2>&1`;

  try {
    const { stdout } = await execAsync(cmd, { cwd: '/Users/serag/Documents/GitHub/dcatoken' });

    // Extract transaction ID
    const txIdMatch = stdout.match(/Transaction ID:\s+([a-f0-9]+)/i);
    const txId = txIdMatch ? txIdMatch[1] : '';

    // Check for success
    const success = stdout.includes('SEALED') || stdout.includes('Status ✅');

    // Extract events
    const events: any[] = [];
    const eventMatches = stdout.matchAll(/Event \d+: A\.\w+\.(\w+)\.(\w+)/g);
    for (const match of eventMatches) {
      events.push({ contract: match[1], name: match[2] });
    }

    return { txId, events, success, error: success ? undefined : stdout };
  } catch (error: any) {
    return { txId: '', events: [], success: false, error: error.message };
  }
}

/**
 * Get total plans count
 */
export async function getTotalPlans(): Promise<number> {
  const result = await executeScript('cadence/scripts/evm/get_total_plans.cdc');
  return parseInt(result);
}

/**
 * Get plan details
 */
export async function getPlan(planId: number): Promise<any> {
  const result = await executeScript('cadence/scripts/evm/get_plan.cdc', [planId.toString()]);
  return result;
}

/**
 * Get user plans
 */
export async function getUserPlans(evmAddress: string): Promise<any> {
  const result = await executeScript('cadence/scripts/evm/get_user_plans.cdc', [evmAddress]);
  return result;
}

/**
 * Check allowance
 */
export async function checkAllowance(userEvmAddress: string, tokenAddress: string): Promise<bigint> {
  const result = await executeScript('cadence/scripts/evm/check_allowance.cdc', [userEvmAddress, tokenAddress]);
  return BigInt(result);
}

/**
 * Get COA address
 */
export async function getCOAAddress(): Promise<string> {
  const result = await executeScript('cadence/scripts/evm/get_coa_address.cdc');
  return result;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a new test suite
 */
export function createTestSuite(name: string): TestSuite {
  return {
    name,
    results: [],
    passedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    startTime: new Date(),
  };
}

/**
 * Add a test result to a suite
 */
export function addTestResult(suite: TestSuite, result: TestResult): void {
  suite.results.push(result);
  if (result.status === 'passed') {
    suite.passedCount++;
  } else if (result.status === 'failed') {
    suite.failedCount++;
  } else {
    suite.skippedCount++;
  }
}

/**
 * Finish a test suite and print summary
 */
export function finishTestSuite(suite: TestSuite): void {
  suite.endTime = new Date();
  const duration = (suite.endTime.getTime() - suite.startTime.getTime()) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log(`TEST SUITE: ${suite.name}`);
  console.log('='.repeat(60));
  console.log(`Total: ${suite.results.length} | Passed: ${suite.passedCount} | Failed: ${suite.failedCount} | Skipped: ${suite.skippedCount}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log('='.repeat(60));

  // Print failed tests
  const failed = suite.results.filter(r => r.status === 'failed');
  if (failed.length > 0) {
    console.log('\nFAILED TESTS:');
    for (const test of failed) {
      console.log(`  - [${test.testId}] ${test.description}`);
      console.log(`    Expected: ${test.expected}`);
      console.log(`    Actual: ${test.actual}`);
      if (test.error) {
        console.log(`    Error: ${test.error}`);
      }
    }
  }

  console.log('\n');
}

/**
 * Run a test and capture the result
 */
export async function runTest(
  suite: TestSuite,
  testId: string,
  description: string,
  expected: string,
  testFn: () => Promise<{ actual: string; passed: boolean }>
): Promise<void> {
  const startTime = Date.now();

  try {
    const { actual, passed } = await testFn();
    const duration = Date.now() - startTime;

    addTestResult(suite, {
      testId,
      description,
      status: passed ? 'passed' : 'failed',
      expected,
      actual,
      duration,
    });

    const statusIcon = passed ? '✅' : '❌';
    console.log(`${statusIcon} [${testId}] ${description} (${duration}ms)`);
  } catch (error: any) {
    const duration = Date.now() - startTime;

    addTestResult(suite, {
      testId,
      description,
      status: 'failed',
      expected,
      actual: 'Error',
      error: error.message,
      duration,
    });

    console.log(`❌ [${testId}] ${description} (${duration}ms)`);
    console.log(`   Error: ${error.message}`);
  }
}

/**
 * Skip a test
 */
export function skipTest(suite: TestSuite, testId: string, description: string, reason: string): void {
  addTestResult(suite, {
    testId,
    description,
    status: 'skipped',
    expected: 'N/A',
    actual: `Skipped: ${reason}`,
  });

  console.log(`⏭️  [${testId}] ${description} - SKIPPED: ${reason}`);
}
