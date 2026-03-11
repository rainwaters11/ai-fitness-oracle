//! AI Fitness Oracle — Soroban smart contract
//!
//! Stores a mapping of `Address` → `u32` representing each user's
//! Verified Streak Count (number of consecutive workout days confirmed
//! by the AI oracle).

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

/// Ledger storage key for the streak map entry.
#[contracttype]
pub enum DataKey {
    Streak(Address),
}

#[contract]
pub struct FitnessTracker;

#[contractimpl]
impl FitnessTracker {
    /// Return the current verified streak count for `user`.
    /// Returns `0` if no streak has been recorded yet.
    pub fn get_streak(env: Env, user: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Streak(user))
            .unwrap_or(0)
    }

    /// Increment the verified streak count for `user` by 1.
    /// Only the account owner may call this function.
    pub fn increment_streak(env: Env, user: Address) -> u32 {
        user.require_auth();

        let streak: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::Streak(user.clone()))
            .unwrap_or(0);

        let new_streak = streak.saturating_add(1);
        env.storage()
            .persistent()
            .set(&DataKey::Streak(user), &new_streak);
        new_streak
    }

    /// Set the verified streak count for `user` to an explicit value.
    /// Useful for oracle-driven updates where the AI backend has verified
    /// a batch of workout sessions.
    /// Only the account owner may call this function.
    pub fn set_streak(env: Env, user: Address, streak: u32) {
        user.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Streak(user), &streak);
    }

    /// Reset the verified streak count for `user` back to zero.
    /// Only the account owner may call this function.
    pub fn reset_streak(env: Env, user: Address) {
        user.require_auth();
        env.storage()
            .persistent()
            .remove(&DataKey::Streak(user));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn test_get_streak_default_is_zero() {
        let env = Env::default();
        let contract_id = env.register(FitnessTracker, ());
        let client = FitnessTrackerClient::new(&env, &contract_id);
        let user = Address::generate(&env);
        assert_eq!(client.get_streak(&user), 0);
    }

    #[test]
    fn test_increment_streak() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(FitnessTracker, ());
        let client = FitnessTrackerClient::new(&env, &contract_id);
        let user = Address::generate(&env);

        assert_eq!(client.increment_streak(&user), 1);
        assert_eq!(client.increment_streak(&user), 2);
        assert_eq!(client.get_streak(&user), 2);
    }

    #[test]
    fn test_set_streak() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(FitnessTracker, ());
        let client = FitnessTrackerClient::new(&env, &contract_id);
        let user = Address::generate(&env);

        client.set_streak(&user, &42);
        assert_eq!(client.get_streak(&user), 42);
    }

    #[test]
    fn test_reset_streak() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(FitnessTracker, ());
        let client = FitnessTrackerClient::new(&env, &contract_id);
        let user = Address::generate(&env);

        client.set_streak(&user, &10);
        client.reset_streak(&user);
        assert_eq!(client.get_streak(&user), 0);
    }
}
