import FlowTransactionScheduler from 0xe467b9dd11fa00df

access(all) fun main(address: Address): Int {
    return FlowTransactionScheduler.getScheduledTransactionsCount(accountAddress: address)
}
