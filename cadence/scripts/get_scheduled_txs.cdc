import FlowTransactionScheduler from 0xe467b9dd11fa00df

access(all) fun main(address: Address): [FlowTransactionScheduler.ScheduledTransactionInfo] {
    return FlowTransactionScheduler.getScheduledTransactions(accountAddress: address, startIndex: 0, count: 20)
}
