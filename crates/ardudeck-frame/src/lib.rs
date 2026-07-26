//! ArduDeck procedural frame generator: build spec -> render-agnostic blueprint
//! and physics geometry, from one shared motor-factor table.

pub mod math;
pub mod tables;
pub mod types;

pub use math::{Mat3, Quat, Vec3};
pub use tables::{motor_factors, FrameError};
pub use types::{EscLayout, FrameClass, FrameType, MotorFactor, UpDown};
