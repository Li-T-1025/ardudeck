use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use crate::math::Vec3;
use crate::spec::{defaults_for, size_class_from_diagonal_mm, FrameGeomSpec, Masses, MotorStator, PlateSpec, PropSpec};
use crate::tables::{motor_factors, FrameError};
use crate::types::{EscLayout, FrameClass, FrameType};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SitlCustomFrameInput {
    pub mass: f64,
    pub diagonal_size: f64,
    pub disc_area: f64,
    pub num_motors: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct VehicleProfileInput {
    pub weight_g: f64,
    pub frame_size_mm: Option<f64>,
    pub motor_count: Option<u32>,
    pub motor_kv: Option<f64>,
    pub prop_diameter_mm: Option<f64>,
    pub esc_rating_a: Option<f64>,
    pub battery_cells: u32,
    pub cog_offset_mm: Option<Vec3>,
}

fn build_spec(
    class: FrameClass,
    ftype: FrameType,
    motor_count: u32,
    diagonal_mm: f64,
    prop_radius_mm: f64,
    total_mass_g: f64,
    cog: Vec3,
) -> FrameGeomSpec {
    let size = size_class_from_diagonal_mm(diagonal_mm);
    let d = defaults_for(size);
    // Split total mass into lumped components by rough fraction. These fractions
    // only set the inertia distribution; total mass is preserved.
    let n = motor_count.max(1) as f64;
    let per_motor = total_mass_g * 0.12 / n;
    let per_prop = total_mass_g * 0.02 / n;
    let per_esc = total_mass_g * 0.06 / n;
    let battery = total_mass_g * 0.35;
    let frame = total_mass_g - per_motor * n - per_prop * n - per_esc * n - battery;
    FrameGeomSpec {
        class,
        frame_type: ftype,
        motor_count,
        arm_len_mm: diagonal_mm / 2.0,
        arm_width_mm: d.arm_width_mm,
        arm_thick_mm: d.arm_thick_mm,
        plate: PlateSpec { len_mm: diagonal_mm * 0.4, width_mm: diagonal_mm * 0.3, thick_mm: 2.0, stack_height_mm: d.stack_height_mm },
        motor_stator: MotorStator { dia_mm: d.stator_dia_mm, height_mm: d.stator_height_mm },
        prop: PropSpec { radius_mm: prop_radius_mm, pitch_in: 0.0, blades: 3 },
        esc_layout: d.esc_layout,
        masses: Masses { frame_g: frame, per_motor_g: per_motor, per_prop_g: per_prop, per_esc_g: per_esc, battery_g: battery },
        cog_offset_mm: cog,
    }
}

pub fn from_sitl_custom_frame(i: &SitlCustomFrameInput) -> FrameGeomSpec {
    let n = i.num_motors.max(1);
    let prop_r_m = (i.disc_area / (n as f64 * PI)).sqrt();
    let class = class_for_motor_count(n);
    build_spec(class, FrameType::X, n, i.diagonal_size * 1000.0, prop_r_m * 1000.0, i.mass * 1000.0, Vec3::new(0.0, 0.0, 0.0))
}

pub fn from_vehicle_profile(i: &VehicleProfileInput, class: FrameClass, ftype: FrameType) -> FrameGeomSpec {
    let motors = motor_factors(class, ftype).map(|m| m.len() as u32).unwrap_or(4);
    let diagonal = i.frame_size_mm.unwrap_or(220.0);
    let prop_r = i.prop_diameter_mm.map(|d| d / 2.0).unwrap_or(diagonal * 0.29);
    let cog = i.cog_offset_mm.unwrap_or(Vec3::new(0.0, 0.0, 0.0));
    build_spec(class, ftype, motors, diagonal, prop_r, i.weight_g, cog)
}

pub fn from_preset(class: FrameClass, ftype: FrameType) -> Result<FrameGeomSpec, FrameError> {
    let motors = motor_factors(class, ftype)?.len() as u32;
    // Preset diagonal by class default; a 5-inch quad-class reference.
    let diagonal = 220.0;
    Ok(build_spec(class, ftype, motors, diagonal, 63.5, 650.0, Vec3::new(0.0, 0.0, 0.0)))
}

fn class_for_motor_count(n: u32) -> FrameClass {
    match n {
        6 => FrameClass::Hexa,
        8 => FrameClass::Octa,
        10 => FrameClass::Deca,
        12 => FrameClass::DodecaHexa,
        _ => FrameClass::Quad,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{FrameClass, FrameType, EscLayout};

    #[test]
    fn sitl_frame_derives_prop_radius_from_disc_area() {
        // disc_area total = num_motors * pi * r^2 -> r = sqrt(area/(n*pi))
        let i = SitlCustomFrameInput { mass: 1.5, diagonal_size: 0.4, disc_area: 0.05, num_motors: 4 };
        let s = from_sitl_custom_frame(&i);
        let expected_r_m = (0.05f64 / (4.0 * std::f64::consts::PI)).sqrt();
        assert!((s.prop.radius_mm - expected_r_m * 1000.0).abs() < 1e-6);
        assert_eq!(s.motor_count, 4);
        assert_eq!(s.arm_len_mm, 200.0); // diagonal 0.4 m / 2 -> 200 mm
    }

    #[test]
    fn vehicle_profile_is_faithful_when_rich() {
        let i = VehicleProfileInput {
            weight_g: 650.0, frame_size_mm: Some(220.0), motor_count: Some(4),
            motor_kv: Some(2400.0), prop_diameter_mm: Some(127.0), esc_rating_a: Some(45.0),
            battery_cells: 6, cog_offset_mm: None,
        };
        let s = from_vehicle_profile(&i, FrameClass::Quad, FrameType::BetaFlightX);
        assert_eq!(s.motor_count, 4);
        assert_eq!(s.arm_len_mm, 110.0);
        assert!((s.prop.radius_mm - 63.5).abs() < 1e-6);
        assert_eq!(s.esc_layout, EscLayout::Stack4in1); // 220mm -> Seven class default
    }

    #[test]
    fn preset_rejects_unsupported_combo() {
        assert!(from_preset(FrameClass::Quad, FrameType::Y6B).is_err());
    }
}
