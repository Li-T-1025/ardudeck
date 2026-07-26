use serde::{Deserialize, Serialize};
use crate::math::{Quat, Vec3};
use crate::physics::physics_geometry;
use crate::spec::FrameGeomSpec;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PartKind { Box, Tube, Disc, Blade, Standoff, Vane }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PartRole { Arm, Plate, MotorBell, MotorStator, Prop, Esc, Stack, Servo, Vane, Boom }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MaterialHint { Carbon, Aluminum, PlasticDark, Metal, PropTranslucent }

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "shape", rename_all = "snake_case")]
pub enum PartDims {
    Box { l: f64, w: f64, h: f64 },
    Tube { r: f64, h: f64 },
    Disc { r: f64, thick: f64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Spin { pub axis: Vec3, pub dir: f64 }

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Part {
    pub kind: PartKind,
    pub role: PartRole,
    pub dims: PartDims,
    pub position: Vec3,
    pub rotation: Quat,
    pub material_hint: MaterialHint,
    pub spin: Option<Spin>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Aabb { pub min: Vec3, pub max: Vec3 }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FrameBlueprint { pub parts: Vec<Part>, pub bounds: Aabb }

pub fn build_blueprint(spec: &FrameGeomSpec) -> FrameBlueprint {
    let g = physics_geometry(spec);
    let mut parts: Vec<Part> = Vec::new();
    let stator_h = spec.motor_stator.height_mm / 1000.0;
    let stator_r = spec.motor_stator.dia_mm / 2000.0;
    let prop_r = spec.prop.radius_mm / 1000.0;
    let arm_w = spec.arm_width_mm / 1000.0;
    let arm_t = spec.arm_thick_mm / 1000.0;

    // Center plate/stack.
    parts.push(Part {
        kind: PartKind::Box, role: PartRole::Plate,
        dims: PartDims::Box { l: spec.plate.len_mm / 1000.0, w: spec.plate.width_mm / 1000.0, h: spec.plate.thick_mm / 1000.0 },
        position: Vec3::new(0.0, 0.0, 0.0), rotation: Quat::identity(),
        material_hint: MaterialHint::Carbon, spin: None,
    });

    for m in &g.motors {
        // Arm from center to motor: a box oriented along the radial direction.
        let len = (m.position.x.powi(2) + m.position.y.powi(2)).sqrt();
        let yaw = m.position.y.atan2(m.position.x);
        parts.push(Part {
            kind: PartKind::Box, role: PartRole::Arm,
            dims: PartDims::Box { l: len, w: arm_w, h: arm_t },
            position: Vec3::new(m.position.x * 0.5, m.position.y * 0.5, 0.0),
            rotation: quat_yaw(yaw), material_hint: MaterialHint::Carbon, spin: None,
        });
        // Motor bell.
        parts.push(Part {
            kind: PartKind::Tube, role: PartRole::MotorBell,
            dims: PartDims::Tube { r: stator_r, h: stator_h },
            position: m.position, rotation: Quat::identity(),
            material_hint: MaterialHint::Aluminum, spin: None,
        });
        // Prop disc (spinning representation), just above the bell.
        parts.push(Part {
            kind: PartKind::Disc, role: PartRole::Prop,
            dims: PartDims::Disc { r: prop_r, thick: 0.002 },
            position: Vec3::new(m.position.x, m.position.y, m.position.z + stator_h),
            rotation: Quat::identity(), material_hint: MaterialHint::PropTranslucent,
            spin: Some(Spin { axis: Vec3::new(0.0, 0.0, 1.0), dir: m.spin_dir }),
        });
    }

    let bounds = compute_bounds(&parts);
    FrameBlueprint { parts, bounds }
}

fn quat_yaw(yaw: f64) -> Quat {
    let h = yaw * 0.5;
    Quat { w: h.cos(), x: 0.0, y: 0.0, z: h.sin() }
}

fn compute_bounds(parts: &[Part]) -> Aabb {
    let mut min = Vec3::new(f64::MAX, f64::MAX, f64::MAX);
    let mut max = Vec3::new(f64::MIN, f64::MIN, f64::MIN);
    for p in parts {
        min = Vec3::new(min.x.min(p.position.x), min.y.min(p.position.y), min.z.min(p.position.z));
        max = Vec3::new(max.x.max(p.position.x), max.y.max(p.position.y), max.z.max(p.position.z));
    }
    Aabb { min, max }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::from_preset;
    use crate::physics::physics_geometry;
    use crate::types::{FrameClass, FrameType};

    #[test]
    fn quad_blueprint_has_motor_and_prop_per_arm() {
        let spec = from_preset(FrameClass::Quad, FrameType::X).unwrap();
        let bp = build_blueprint(&spec);
        let motors = bp.parts.iter().filter(|p| p.role == PartRole::MotorBell).count();
        let props = bp.parts.iter().filter(|p| p.role == PartRole::Prop).count();
        assert_eq!(motors, 4);
        assert_eq!(props, 4);
    }

    #[test]
    fn every_prop_part_carries_spin() {
        let spec = from_preset(FrameClass::Hexa, FrameType::X).unwrap();
        let bp = build_blueprint(&spec);
        for p in bp.parts.iter().filter(|p| p.role == PartRole::Prop) {
            assert!(p.spin.is_some());
        }
    }

    #[test]
    fn blueprint_motor_positions_equal_physics_mounts() {
        // The invariant: mesh and physics agree on where motors are.
        let spec = from_preset(FrameClass::Octa, FrameType::X).unwrap();
        let bp = build_blueprint(&spec);
        let g = physics_geometry(&spec);
        let mut bells: Vec<_> = bp.parts.iter().filter(|p| p.role == PartRole::MotorBell).map(|p| p.position).collect();
        for mount in &g.motors {
            let hit = bells.iter().position(|b| (b.x - mount.position.x).abs() < 1e-9 && (b.y - mount.position.y).abs() < 1e-9 && (b.z - mount.position.z).abs() < 1e-9);
            assert!(hit.is_some(), "no bell at mount {:?}", mount.position);
            bells.remove(hit.unwrap());
        }
        assert!(bells.is_empty());
    }
}
