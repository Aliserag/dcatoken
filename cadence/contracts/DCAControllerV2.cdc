import "DCAPlanV2"
import "FungibleToken"
import "FlowToken"
import TeleportedTetherToken from 0xcfdd90d4a00f7b5b

/// DCAController: User's DCA management resource
///
/// Each user has one DCAController stored in their account that:
/// - Holds all their DCA plans
/// - Stores capabilities to their token vaults
/// - Provides public interface for querying plans
///
/// Educational Notes:
/// - One controller per user, stored at /storage/DCAController
/// - Controller holds references (not vaults) to user's tokens
/// - Scheduled handlers borrow capabilities from the controller
/// - Owner entitlement grants privileged access to handler
access(all) contract DCAControllerV2 {

    /// Owner entitlement for privileged controller access
    /// This is required by DCATransactionHandler to update plans
    access(all) entitlement Owner

    /// Storage paths
    access(all) let ControllerStoragePath: StoragePath
    access(all) let ControllerPublicPath: PublicPath

    /// Event emitted when a controller is created
    access(all) event ControllerCreated(owner: Address)

    /// Event emitted when a plan is added to controller
    access(all) event PlanAddedToController(owner: Address, planId: UInt64)

    /// Event emitted when a plan is removed from controller
    access(all) event PlanRemovedFromController(owner: Address, planId: UInt64)

    /// Public interface for reading controller state
    access(all) resource interface ControllerPublic {
        access(all) view fun getPlanIds(): [UInt64]
        access(all) view fun getPlan(id: UInt64): &DCAPlanV2.Plan?
        access(all) fun getAllPlans(): [DCAPlanV2.PlanDetails]
        access(all) fun getActivePlans(): [DCAPlanV2.PlanDetails]
    }

    /// The main Controller resource
    ///
    /// Stores all DCA plans for a user and manages vault capabilities.
    access(all) resource Controller: ControllerPublic {
        /// Dictionary of all plans owned by this controller
        access(self) let plans: @{UInt64: DCAPlanV2.Plan}

        /// Capability to withdraw from source token vault (typically FLOW)
        /// This is used by scheduled handlers to fund DCA executions
        access(self) var sourceVaultCap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>?

        /// Capability to deposit to target token vault (typically Beaver)
        /// This is used by scheduled handlers to deposit acquired tokens
        access(self) var targetVaultCap: Capability<&{FungibleToken.Receiver}>?

        /// Capability to withdraw FLOW for scheduler fees
        /// This is used by scheduled handlers to pay for autonomous execution
        access(self) var feeVaultCap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>?

        init() {
            self.plans <- {}
            self.sourceVaultCap = nil
            self.targetVaultCap = nil
            self.feeVaultCap = nil
        }

        /// Set the source vault capability
        ///
        /// This should be called once during setup to give the controller
        /// permission to withdraw from the user's source token vault.
        ///
        /// @param cap: Capability with withdraw auth to source vault
        access(all) fun setSourceVaultCapability(
            cap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>
        ) {
            pre {
                cap.check(): "Invalid source vault capability"
            }
            self.sourceVaultCap = cap
        }

        /// Set the target vault capability
        ///
        /// This should be called once during setup to give the controller
        /// permission to deposit to the user's target token vault.
        ///
        /// @param cap: Capability to deposit to target vault
        access(all) fun setTargetVaultCapability(
            cap: Capability<&{FungibleToken.Receiver}>
        ) {
            pre {
                cap.check(): "Invalid target vault capability"
            }
            self.targetVaultCap = cap
        }

        /// Get source vault capability (for scheduled handler)
        access(all) fun getSourceVaultCapability(): Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>? {
            return self.sourceVaultCap
        }

        /// Get target vault capability (for scheduled handler)
        access(all) fun getTargetVaultCapability(): Capability<&{FungibleToken.Receiver}>? {
            return self.targetVaultCap
        }

        /// Set the fee vault capability
        ///
        /// This should be called once during setup to give the controller
        /// permission to withdraw FLOW from the user's vault to pay scheduler fees.
        ///
        /// @param cap: Capability with withdraw auth to FLOW vault
        access(all) fun setFeeVaultCapability(
            cap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>
        ) {
            pre {
                cap.check(): "Invalid fee vault capability"
            }
            self.feeVaultCap = cap
        }

        /// Get fee vault capability (for scheduled handler)
        ///
        /// Returns capability to withdraw FLOW for scheduler execution fees.
        access(all) fun getFeeVaultCapability(): Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>? {
            return self.feeVaultCap
        }

        /// Add a new plan to this controller
        ///
        /// @param plan: The DCA plan resource to add
        access(all) fun addPlan(plan: @DCAPlanV2.Plan) {
            let planId = plan.id

            // Ensure no duplicate plan IDs
            assert(!self.plans.containsKey(planId), message: "Plan already exists")

            self.plans[planId] <-! plan

            // Emit event (note: owner address must be obtained from context)
            emit PlanAddedToController(owner: self.owner!.address, planId: planId)
        }

        /// Remove and return a plan from this controller
        ///
        /// This allows users to cancel plans or transfer them.
        ///
        /// @param id: Plan ID to remove
        /// @return The removed plan resource
        access(all) fun removePlan(id: UInt64): @DCAPlanV2.Plan {
            pre {
                self.plans.containsKey(id): "Plan does not exist"
            }

            let plan <- self.plans.remove(key: id)!
            emit PlanRemovedFromController(owner: self.owner!.address, planId: id)
            return <- plan
        }

        /// Borrow a reference to a plan (mutable)
        ///
        /// Used by scheduled handlers to update plan state during execution.
        /// Requires Owner entitlement for privileged access.
        ///
        /// @param id: Plan ID
        /// @return Mutable reference to the plan
        access(Owner) fun borrowPlan(id: UInt64): &DCAPlanV2.Plan? {
            return &self.plans[id]
        }

        // ========================================
        // Public Interface Implementation
        // ========================================

        /// Get all plan IDs in this controller
        access(all) view fun getPlanIds(): [UInt64] {
            return self.plans.keys
        }

        /// Get a read-only reference to a specific plan
        access(all) view fun getPlan(id: UInt64): &DCAPlanV2.Plan? {
            return &self.plans[id]
        }

        /// Get details of all plans
        access(all) fun getAllPlans(): [DCAPlanV2.PlanDetails] {
            let details: [DCAPlanV2.PlanDetails] = []
            for id in self.plans.keys {
                if let plan = &self.plans[id] as &DCAPlanV2.Plan? {
                    details.append(plan.getDetails())
                }
            }
            return details
        }

        /// Get details of only active plans
        access(all) fun getActivePlans(): [DCAPlanV2.PlanDetails] {
            let details: [DCAPlanV2.PlanDetails] = []
            for id in self.plans.keys {
                if let plan = &self.plans[id] as &DCAPlanV2.Plan? {
                    if plan.status == DCAPlanV2.PlanStatus.Active {
                        details.append(plan.getDetails())
                    }
                }
            }
            return details
        }

        /// Check if controller has required capabilities configured
        access(all) view fun isFullyConfigured(): Bool {
            if let sourceCap = self.sourceVaultCap {
                if let targetCap = self.targetVaultCap {
                    if let feeCap = self.feeVaultCap {
                        return sourceCap.check() && targetCap.check() && feeCap.check()
                    }
                }
            }
            return false
        }
    }

    /// Create a new DCA controller
    ///
    /// Users call this once to set up their DCA management resource.
    access(all) fun createController(): @Controller {
        return <- create Controller()
    }

    init() {
        self.ControllerStoragePath = /storage/DCAControllerV2
        self.ControllerPublicPath = /public/DCAControllerV2
    }
}
