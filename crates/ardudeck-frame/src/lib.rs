//! ArduDeck procedural frame generator: build spec -> render-agnostic blueprint
//! and physics geometry, from one shared motor-factor table.

pub mod math;
pub mod tables;
pub mod types;

pub use math::{Mat3, Quat, Vec3};
pub use tables::{frame_controls, motor_factors, FrameControls, FrameError, ServoMount, VaneMount};
pub use types::{EscLayout, FrameClass, FrameType, MotorFactor, UpDown};
