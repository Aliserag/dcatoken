/**
 * Transaction Hook
 *
 * Custom React hook for managing Flow transaction lifecycle.
 * Provides status tracking, error handling, and user feedback.
 */

import { useState, useCallback } from "react";
import * as fcl from "@onflow/fcl";
import { TransactionStatus, mapFCLStatus } from "@/config/fcl-config";

interface TransactionState {
  status: TransactionStatus;
  txId: string | null;
  error: string | null;
  errorCode: number | null;
}

export interface TransactionResult {
  success: boolean;
  txId?: string;
  error?: string;
  errorCode?: number;
  events?: any[]; // Transaction events
}

export function useTransaction() {
  const [state, setState] = useState<TransactionState>({
    status: TransactionStatus.IDLE,
    txId: null,
    error: null,
    errorCode: null,
  });

  const resetTransaction = useCallback(() => {
    setState({
      status: TransactionStatus.IDLE,
      txId: null,
      error: null,
      errorCode: null,
    });
  }, []);

  const executeTransaction = useCallback(
    async (
      cadence: string,
      args: (arg: typeof fcl.arg, t: any) => any[],
      limit = 9999
    ): Promise<TransactionResult> => {
      resetTransaction();
      setState((prev) => ({ ...prev, status: TransactionStatus.PENDING }));

      try {
        // Send transaction
        const transactionId = await fcl.mutate({
          cadence,
          args,
          proposer: fcl.authz as any,
          payer: fcl.authz as any,
          authorizations: [fcl.authz as any],
          limit,
        });

        setState((prev) => ({
          ...prev,
          txId: transactionId,
          status: TransactionStatus.EXECUTING,
        }));

        // Subscribe to transaction status updates
        const unsub = fcl.tx(transactionId).subscribe((tx) => {
          const mappedStatus = mapFCLStatus(tx.statusCode);
          setState((prev) => ({ ...prev, status: mappedStatus }));

          // Log status for debugging
          console.log(`Transaction ${transactionId} status:`, tx.statusString);

          if (tx.errorMessage) {
            console.error(`Transaction error:`, tx.errorMessage);
          }
        });

        // Wait for transaction to be sealed
        const sealedTx = await fcl.tx(transactionId).onceSealed();

        unsub(); // Cleanup subscription

        // Check for errors first - errorMessage takes priority
        if (sealedTx.errorMessage) {
          setState((prev) => ({
            ...prev,
            status: TransactionStatus.ERROR,
            error: sealedTx.errorMessage,
            errorCode: sealedTx.statusCode,
          }));
          return {
            success: false,
            txId: transactionId,
            error: sealedTx.errorMessage,
            errorCode: sealedTx.statusCode,
          };
        }

        // onceSealed() only resolves when sealed, so if we get here without error, it's success
        // Status code 4 = SEALED, but sometimes FCL returns 0 after onceSealed()
        // If no errorMessage, we trust that onceSealed() worked
        setState((prev) => ({ ...prev, status: TransactionStatus.SEALED }));
        return {
          success: true,
          txId: transactionId,
          events: sealedTx.events || []
        };
      } catch (error: any) {
        console.error("Transaction execution failed:", error);
        const errorMsg = error.message || "Failed to execute transaction";
        setState((prev) => ({
          ...prev,
          status: TransactionStatus.ERROR,
          error: errorMsg,
        }));
        return { success: false, error: errorMsg };
      }
    },
    [resetTransaction]
  );

  return {
    ...state,
    executeTransaction,
    resetTransaction,
    isLoading:
      state.status === TransactionStatus.PENDING ||
      state.status === TransactionStatus.EXECUTING ||
      state.status === TransactionStatus.SEALING,
    isSuccess: state.status === TransactionStatus.SEALED,
    isError: state.status === TransactionStatus.ERROR,
  };
}
