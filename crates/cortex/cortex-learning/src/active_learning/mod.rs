//! Active learning loop: candidate selection, prompt generation, feedback processing.

pub mod candidate_selector;
pub mod feedback_processor;
pub mod prompt_generator;

pub use candidate_selector::{SelectionCriteria, select_candidates};
pub use feedback_processor::{Feedback, FeedbackResult, process_feedback};
pub use prompt_generator::{ValidationPrompt, generate_prompt};
