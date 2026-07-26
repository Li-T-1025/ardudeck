use crate::types::{FrameClass, FrameType, MotorFactor, UpDown};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FrameError {
    UnsupportedCombo(FrameClass, FrameType),
}

fn flat(specs: &[(f64, f64)]) -> Vec<MotorFactor> {
    specs
        .iter()
        .map(|&(angle_deg, yaw_factor)| MotorFactor { angle_deg, yaw_factor, updown: UpDown::Flat })
        .collect()
}

// Porting note: the old crates/ardudeck-sim-engine/src/frame_geometry.rs labeled its
// "hexa X" / "octa X" constants with the angle sets that AP_MotorsMatrix.cpp's
// setup_hexa_matrix / setup_octa_matrix actually assign to MOTOR_FRAME_TYPE_PLUS, not
// MOTOR_FRAME_TYPE_X. FrameType::X here MUST return the real ArduPilot X layout (see
// setup_hexa_matrix@792, setup_octa_matrix@874) and FrameType::Plus the real Plus layout
// (setup_hexa_matrix@779, setup_octa_matrix@858) - do not swap these to make old code
// byte-identical. Task 11 (ardudeck-sim-engine delegation) is responsible for mapping the
// legacy 6/8-motor "X" call sites onto FrameType::Plus so the simulated engine keeps
// producing identical physics; that mapping belongs there, not in this table.
pub fn motor_factors(class: FrameClass, ftype: FrameType) -> Result<Vec<MotorFactor>, FrameError> {
    use FrameClass::*;
    use FrameType::*;
    let flat_specs: Option<&[(f64, f64)]> = match (class, ftype) {
        // AP_MotorsMatrix.cpp setup_quad_matrix, case MOTOR_FRAME_TYPE_X (line 591).
        (Quad, X) => Some(&[(45.0, 1.0), (-135.0, 1.0), (-45.0, -1.0), (135.0, -1.0)]),
        // AP_MotorsMatrix.cpp setup_quad_matrix, case MOTOR_FRAME_TYPE_PLUS (line 580).
        (Quad, Plus) => Some(&[(90.0, 1.0), (-90.0, 1.0), (0.0, -1.0), (180.0, -1.0)]),
        // AP_MotorsMatrix.cpp setup_quad_matrix, case MOTOR_FRAME_TYPE_H (line 688): same
        // angles as X, yaw factors inverted (source comment: "same as X but motors spin in
        // opposite directions").
        (Quad, H) => Some(&[(45.0, -1.0), (-135.0, -1.0), (-45.0, 1.0), (135.0, 1.0)]),
        // AP_MotorsMatrix.cpp setup_quad_matrix, case MOTOR_FRAME_TYPE_V (line 677). Yaw
        // factors are ArduPilot's own thrust-vectoring-derived constants (0.7981), not
        // +-1; they still sum to zero. Do not round these to +-1.
        (Quad, V) => Some(&[(45.0, 0.7981), (-135.0, 1.0), (-45.0, -0.7981), (135.0, -1.0)]),
        // AP_MotorsMatrix.cpp setup_quad_matrix, case MOTOR_FRAME_TYPE_BF_X (line 626).
        (Quad, BetaFlightX) => Some(&[(135.0, -1.0), (45.0, 1.0), (-135.0, 1.0), (-45.0, -1.0)]),

        // AP_MotorsMatrix.cpp setup_hexa_matrix, case MOTOR_FRAME_TYPE_X (line 792).
        (Hexa, X) => Some(&[
            (90.0, -1.0), (-90.0, 1.0), (-30.0, -1.0),
            (150.0, 1.0), (30.0, 1.0), (-150.0, -1.0),
        ]),
        // AP_MotorsMatrix.cpp setup_hexa_matrix, case MOTOR_FRAME_TYPE_PLUS (line 779).
        (Hexa, Plus) => Some(&[
            (0.0, -1.0), (180.0, 1.0), (-120.0, -1.0),
            (60.0, 1.0), (-60.0, 1.0), (120.0, -1.0),
        ]),

        // AP_MotorsMatrix.cpp setup_octa_matrix, case MOTOR_FRAME_TYPE_X (line 874).
        (Octa, X) => Some(&[
            (22.5, -1.0), (-157.5, -1.0), (67.5, 1.0), (157.5, 1.0),
            (-22.5, 1.0), (-112.5, 1.0), (-67.5, -1.0), (112.5, -1.0),
        ]),
        // AP_MotorsMatrix.cpp setup_octa_matrix, case MOTOR_FRAME_TYPE_PLUS (line 858).
        (Octa, Plus) => Some(&[
            (0.0, -1.0), (180.0, -1.0), (45.0, 1.0), (135.0, 1.0),
            (-45.0, 1.0), (-135.0, 1.0), (-90.0, -1.0), (90.0, -1.0),
        ]),

        // AP_MotorsMatrix.cpp setup_deca_matrix, case MOTOR_FRAME_TYPE_X / MOTOR_FRAME_TYPE_CW_X
        // (line 1218; both frame types share this table).
        (Deca, X) => Some(&[
            (18.0, 1.0), (54.0, -1.0), (90.0, 1.0), (126.0, -1.0), (162.0, 1.0),
            (-162.0, -1.0), (-126.0, 1.0), (-90.0, -1.0), (-54.0, 1.0), (-18.0, -1.0),
        ]),

        // AP_MotorsMatrix.cpp setup_dodecahexa_matrix, case MOTOR_FRAME_TYPE_X (line 1118).
        (DodecaHexa, X) => Some(&[
            (30.0, 1.0), (30.0, -1.0), (90.0, -1.0), (90.0, 1.0), (150.0, 1.0), (150.0, -1.0),
            (-150.0, -1.0), (-150.0, 1.0), (-90.0, 1.0), (-90.0, -1.0), (-30.0, -1.0), (-30.0, 1.0),
        ]),
        _ => None,
    };
    if let Some(specs) = flat_specs {
        return Ok(flat(specs));
    }
    Err(FrameError::UnsupportedCombo(class, ftype))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{FrameClass, FrameType, UpDown};

    fn yaw_sum(v: &[MotorFactor]) -> f64 {
        v.iter().map(|m| m.yaw_factor).sum()
    }

    #[test]
    fn quad_x_matches_stock_sitl() {
        // Verbatim from frame_geometry.rs: MOT_1(45,CCW) 2(-135,CCW) 3(-45,CW) 4(135,CW)
        let m = motor_factors(FrameClass::Quad, FrameType::X).unwrap();
        let expect = [(45.0, 1.0), (-135.0, 1.0), (-45.0, -1.0), (135.0, -1.0)];
        assert_eq!(m.len(), 4);
        for (got, (a, y)) in m.iter().zip(expect) {
            assert_eq!(got.angle_deg, a);
            assert_eq!(got.yaw_factor, y);
            assert_eq!(got.updown, UpDown::Flat);
        }
    }

    #[test]
    fn hexa_x_matches_ardupilot() {
        // AP_MotorsMatrix.cpp setup_hexa_matrix, case MOTOR_FRAME_TYPE_X (line 792).
        let m = motor_factors(FrameClass::Hexa, FrameType::X).unwrap();
        let expect = [
            (90.0, -1.0), (-90.0, 1.0), (-30.0, -1.0),
            (150.0, 1.0), (30.0, 1.0), (-150.0, -1.0),
        ];
        assert_eq!(m.len(), 6);
        for (got, (a, y)) in m.iter().zip(expect) {
            assert_eq!(got.angle_deg, a);
            assert_eq!(got.yaw_factor, y);
        }
    }

    #[test]
    fn hexa_plus_matches_ardupilot() {
        // AP_MotorsMatrix.cpp setup_hexa_matrix, case MOTOR_FRAME_TYPE_PLUS (line 779).
        let m = motor_factors(FrameClass::Hexa, FrameType::Plus).unwrap();
        let expect = [
            (0.0, -1.0), (180.0, 1.0), (-120.0, -1.0),
            (60.0, 1.0), (-60.0, 1.0), (120.0, -1.0),
        ];
        assert_eq!(m.len(), 6);
        for (got, (a, y)) in m.iter().zip(expect) {
            assert_eq!(got.angle_deg, a);
            assert_eq!(got.yaw_factor, y);
        }
    }

    #[test]
    fn octa_x_matches_ardupilot() {
        // AP_MotorsMatrix.cpp setup_octa_matrix, case MOTOR_FRAME_TYPE_X (line 874).
        let m = motor_factors(FrameClass::Octa, FrameType::X).unwrap();
        let expect = [
            (22.5, -1.0), (-157.5, -1.0), (67.5, 1.0), (157.5, 1.0),
            (-22.5, 1.0), (-112.5, 1.0), (-67.5, -1.0), (112.5, -1.0),
        ];
        assert_eq!(m.len(), 8);
        for (got, (a, y)) in m.iter().zip(expect) {
            assert_eq!(got.angle_deg, a);
            assert_eq!(got.yaw_factor, y);
        }
    }

    #[test]
    fn octa_plus_matches_ardupilot() {
        // AP_MotorsMatrix.cpp setup_octa_matrix, case MOTOR_FRAME_TYPE_PLUS (line 858).
        let m = motor_factors(FrameClass::Octa, FrameType::Plus).unwrap();
        let expect = [
            (0.0, -1.0), (180.0, -1.0), (45.0, 1.0), (135.0, 1.0),
            (-45.0, 1.0), (-135.0, 1.0), (-90.0, -1.0), (90.0, -1.0),
        ];
        assert_eq!(m.len(), 8);
        for (got, (a, y)) in m.iter().zip(expect) {
            assert_eq!(got.angle_deg, a);
            assert_eq!(got.yaw_factor, y);
        }
    }

    #[test]
    fn balanced_and_sized_for_standard_classes() {
        // (class, type, motor_count) for every standard-matrix combo ported so far.
        let combos = [
            (FrameClass::Quad, FrameType::X, 4),
            (FrameClass::Quad, FrameType::Plus, 4),
            (FrameClass::Quad, FrameType::H, 4),
            (FrameClass::Quad, FrameType::V, 4),
            (FrameClass::Quad, FrameType::BetaFlightX, 4),
            (FrameClass::Hexa, FrameType::X, 6),
            (FrameClass::Hexa, FrameType::Plus, 6),
            (FrameClass::Octa, FrameType::X, 8),
            (FrameClass::Octa, FrameType::Plus, 8),
            (FrameClass::Deca, FrameType::X, 10),
            (FrameClass::DodecaHexa, FrameType::X, 12),
        ];
        for (c, t, n) in combos {
            let m = motor_factors(c, t).unwrap();
            assert_eq!(m.len(), n, "{:?}/{:?} motor count", c, t);
            assert!(yaw_sum(&m).abs() < 1e-9, "{:?}/{:?} yaw not balanced", c, t);
        }
    }

    #[test]
    fn unsupported_combo_errors() {
        assert!(motor_factors(FrameClass::Quad, FrameType::Y6B).is_err());
    }
}
