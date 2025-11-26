import "DCAPlan"
import "FungibleToken"
import "FlowToken"

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
access(all) contract DCAController {

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
        access(all) fun getPlanIds(): [UInt64]
        access(all) fun getPlan(id: UInt64): &DCAPlan.Plan?
        access(all) fun getAllPlans(): [DCAPlan.PlanDetails]
        access(all) fun getActivePlans(): [DCAPlan.PlanDetails]
    }

    /// The main Controller resource
    ///
    /// Stores all DCA plans for a user and manages vault capabilities.
    access(all) resource Controller: ControllerPublic {
        /// Dictionary of all plans owned by this controller
        access(self) let plans: @{UInt64: DCAPlan.Plan}

        /// Capability to withdraw from source token vault (typically FLOW)
        /// This is used by scheduled handlers to fund DCA executions
        access(self) var sourceVaultCap: Capability<auth(FungibleToken.Withdraw) &{FungibleToken.Vault}>?

        /// Capability to deposit to target token vault (typically Beaver)
        /// This is used by scheduled handlers to deposit acquired tokens
        access(self) var targetVaultCap: Capability<&{FungibleToken.Receiver}>?

        init() {
            self.plans <- {}
            self.sourceVaultCap = nil
            self.targetVaultCap = nil
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

        /// Add a new plan to this controller
        ///
        /// @param plan: The DCA plan resource to add
        access(all) fun addPlan(plan: @DCAPlan.Plan) {
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
        access(all) fun removePlan(id: UInt64): @DCAPlan.Plan {
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
        access(Owner) fun borrowPlan(id: UInt64): &DCAPlan.Plan? {
            return &self.plans[id]
        }

        // ========================================
        // Public Interface Implementation
        // ========================================

        /// Get all plan IDs in this controller
        access(all) fun getPlanIds(): [UInt64] {
            return self.plans.keys
        }

        /// Get a read-only reference to a specific plan
        access(all) fun getPlan(id: UInt64): &DCAPlan.Plan? {
            return &self.plans[id]
        }

        /// Get details of all plans
        access(all) fun getAllPlans(): [DCAPlan.PlanDetails] {
            let details: [DCAPlan.PlanDetails] = []
            for id in self.plans.keys {
                if let plan = &self.plans[id] as &DCAPlan.Plan? {
                    details.append(plan.getDetails())
                }
            }
            return details
        }

        /// Get details of only active plans
        access(all) fun getActivePlans(): [DCAPlan.PlanDetails] {
            let details: [DCAPlan.PlanDetails] = []
            for id in self.plans.keys {
                if let plan = &self.plans[id] as &DCAPlan.Plan? {
                    if plan.status == DCAPlan.PlanStatus.Active {
                        details.append(plan.getDetails())
                    }
                }
            }
            return details
        }

        /// Check if controller has required capabilities configured
        access(all) fun isFullyConfigured(): Bool {
            if let sourceCap = self.sourceVaultCap {
                if let targetCap = self.targetVaultCap {
                    return sourceCap.check() && targetCap.check()
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
        self.ControllerStoragePath = /storage/DCAController
        self.ControllerPublicPath = /public/DCAController
    }
}
