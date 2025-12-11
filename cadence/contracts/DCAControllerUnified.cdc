import "DCAPlanUnified"
import "FungibleToken"
import "FlowToken"
import "EVM"

/// DCAControllerUnified: Unified DCA Controller with Optional COA Support
///
/// Supports both Cadence-native (IncrementFi) and EVM (UniswapV3) swaps.
/// COA capability is optional - only required for EVM token swaps.
///
/// Storage: /storage/DCAControllerUnified
access(all) contract DCAControllerUnified {

    access(all) entitlement Owner

    access(all) let ControllerStoragePath: StoragePath
    access(all) let ControllerPublicPath: PublicPath

    access(all) event ControllerCreated(owner: Address)
    access(all) event PlanAddedToController(owner: Address, planId: UInt64)
    access(all) event PlanRemovedFromController(owner: Address, planId: UInt64)

    access(all) resource interface ControllerPublic {
        access(all) view fun getPlanIds(): [UInt64]
        access(all) view fun getPlan(id: UInt64): &DCAPlanUnified.Plan?
        access(all) fun getAllPlans(): [DCAPlanUnified.PlanDetails]
        access(all) fun getActivePlans(): [DCAPlanUnified.PlanDetails]
    }

    access(all) resource Controller: ControllerPublic {
        access(self) let plans: @{UInt64: DCAPlanUnified.Plan}

        /// Source vault capability (withdraw for swap input)
        access(self) var sourceVaultCap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>?

        /// Target vault capability (deposit for swap output)
        access(self) var targetVaultCap: Capability<&{FungibleToken.Receiver}>?

        /// Fee vault capability (withdraw FLOW for scheduler fees)
        access(self) var feeVaultCap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>?

        /// COA capability - OPTIONAL (only needed for EVM token swaps)
        access(self) var coaCap: Capability<auth(EVM.Owner) &EVM.CadenceOwnedAccount>?

        init() {
            self.plans <- {}
            self.sourceVaultCap = nil
            self.targetVaultCap = nil
            self.feeVaultCap = nil
            self.coaCap = nil
        }

        access(all) fun setSourceVaultCapability(
            cap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>
        ) {
            pre {
                cap.check(): "Invalid source vault capability"
            }
            self.sourceVaultCap = cap
        }

        access(all) fun setTargetVaultCapability(
            cap: Capability<&{FungibleToken.Receiver}>
        ) {
            pre {
                cap.check(): "Invalid target vault capability"
            }
            self.targetVaultCap = cap
        }

        access(all) fun setFeeVaultCapability(
            cap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>
        ) {
            pre {
                cap.check(): "Invalid fee vault capability"
            }
            self.feeVaultCap = cap
        }

        /// Set COA capability (optional - only for EVM swaps)
        access(all) fun setCOACapability(
            cap: Capability<auth(EVM.Owner) &EVM.CadenceOwnedAccount>
        ) {
            pre {
                cap.check(): "Invalid COA capability"
            }
            self.coaCap = cap
        }

        access(all) fun getSourceVaultCapability(): Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>? {
            return self.sourceVaultCap
        }

        access(all) fun getTargetVaultCapability(): Capability<&{FungibleToken.Receiver}>? {
            return self.targetVaultCap
        }

        access(all) fun getFeeVaultCapability(): Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>? {
            return self.feeVaultCap
        }

        access(all) fun getCOACapability(): Capability<auth(EVM.Owner) &EVM.CadenceOwnedAccount>? {
            return self.coaCap
        }

        access(all) fun addPlan(plan: @DCAPlanUnified.Plan) {
            let planId = plan.id
            assert(!self.plans.containsKey(planId), message: "Plan already exists")
            self.plans[planId] <-! plan
            emit PlanAddedToController(owner: self.owner!.address, planId: planId)
        }

        access(all) fun removePlan(id: UInt64): @DCAPlanUnified.Plan {
            pre {
                self.plans.containsKey(id): "Plan does not exist"
            }
            let plan <- self.plans.remove(key: id)!
            emit PlanRemovedFromController(owner: self.owner!.address, planId: id)
            return <- plan
        }

        access(Owner) fun borrowPlan(id: UInt64): &DCAPlanUnified.Plan? {
            return &self.plans[id]
        }

        access(all) view fun getPlanIds(): [UInt64] {
            return self.plans.keys
        }

        access(all) view fun getPlan(id: UInt64): &DCAPlanUnified.Plan? {
            return &self.plans[id]
        }

        access(all) fun getAllPlans(): [DCAPlanUnified.PlanDetails] {
            let details: [DCAPlanUnified.PlanDetails] = []
            for id in self.plans.keys {
                if let plan = &self.plans[id] as &DCAPlanUnified.Plan? {
                    details.append(plan.getDetails())
                }
            }
            return details
        }

        access(all) fun getActivePlans(): [DCAPlanUnified.PlanDetails] {
            let details: [DCAPlanUnified.PlanDetails] = []
            for id in self.plans.keys {
                if let plan = &self.plans[id] as &DCAPlanUnified.Plan? {
                    if plan.status == DCAPlanUnified.PlanStatus.Active {
                        details.append(plan.getDetails())
                    }
                }
            }
            return details
        }

        /// Check if controller is configured for Cadence-native swaps
        access(all) view fun isConfiguredForCadence(): Bool {
            if let sourceCap = self.sourceVaultCap {
                if let targetCap = self.targetVaultCap {
                    if let feeCap = self.feeVaultCap {
                        return sourceCap.check() && targetCap.check() && feeCap.check()
                    }
                }
            }
            return false
        }

        /// Check if controller is configured for EVM swaps (includes COA)
        access(all) view fun isConfiguredForEVM(): Bool {
            if !self.isConfiguredForCadence() {
                return false
            }
            if let coaCap = self.coaCap {
                return coaCap.check()
            }
            return false
        }

        /// Legacy: Check if fully configured (for backward compatibility)
        /// Returns true if configured for Cadence OR (Cadence + EVM)
        access(all) view fun isFullyConfigured(): Bool {
            return self.isConfiguredForCadence()
        }

        /// Check if configured for a specific plan
        access(all) fun isConfiguredForPlan(planId: UInt64): Bool {
            if let plan = &self.plans[planId] as &DCAPlanUnified.Plan? {
                if plan.requiresEVM() {
                    return self.isConfiguredForEVM()
                } else {
                    return self.isConfiguredForCadence()
                }
            }
            return false
        }
    }

    access(all) fun createController(): @Controller {
        return <- create Controller()
    }

    init() {
        self.ControllerStoragePath = /storage/DCAControllerUnified
        self.ControllerPublicPath = /public/DCAControllerUnified
    }
}
