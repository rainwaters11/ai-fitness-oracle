// contracts/src/lib.rs
// Re-export the fitness tracker contract so Soroban tooling picks it up.
pub mod fitness_tracker;
pub use fitness_tracker::FitnessTracker;
