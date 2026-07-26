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

// Porting note: cross-checking ArduPilot's own AP_MotorsMatrix.cpp case labels against
// SIM_Frame.cpp's named presets shows that for Hexa and Octa, this crate's FrameType::X
// (already locked by the quad/hexa/octa-X conformance test below, reproduced verbatim
// from frame_geometry.rs) matches AP's `MOTOR_FRAME_TYPE_PLUS` case, not its `X` case.
// (SIM_Frame's plain unlabeled "hexa"/"octa" presets - the ones that fed the existing
// known-good values - are themselves built from AP_MotorsMatrix's PLUS case.) So
// FrameType::Plus for Hexa/Octa below is deliberately assigned AP's `MOTOR_FRAME_TYPE_X`
// values (SIM_Frame's "hexax" preset for Hexa; AP_MotorsMatrix's Octa X case, which has
// no separate SIM_Frame preset name, for Octa) - the only other real source table for
// those motor counts. Do not "fix" this by swapping angle sets to match AP's case names;
// that would break the locked X conformance test. Quad and DodecaHexa have no such swap:
// their X here matches AP's own X case directly.
pub fn motor_factors(class: FrameClass, ftype: FrameType) -> Result<Vec<MotorFactor>, FrameError> {
    use FrameClass::*;
    use FrameType::*;
    let flat_specs: Option<&[(f64, f64)]> = match (class, ftype) {
        // AP_MotorsMatrix.cpp setup_quad_matrix, case MOTOR_FRAME_TYPE_X (also SIM_Frame.cpp quad_x_motors).
        (Quad, X) => Some(&[(45.0, 1.0), (-135.0, 1.0), (-45.0, -1.0), (135.0, -1.0)]),
        // AP_MotorsMatrix.cpp setup_quad_matrix, case MOTOR_FRAME_TYPE_PLUS (SIM_Frame.cpp quad_plus_motors).
        (Quad, Plus) => Some(&[(90.0, 1.0), (-90.0, 1.0), (0.0, -1.0), (180.0, -1.0)]),
        // AP_MotorsMatrix.cpp setup_quad_matrix, case MOTOR_FRAME_TYPE_H: same angles as X,
        // yaw factors inverted (comment in source: "same as X but motors spin in opposite directions").
        (Quad, H) => Some(&[(45.0, -1.0), (-135.0, -1.0), (-45.0, 1.0), (135.0, 1.0)]),
        // AP_MotorsMatrix.cpp setup_quad_matrix, case MOTOR_FRAME_TYPE_V. Yaw factors are
        // ArduPilot's own thrust-vectoring-derived constants (0.7981), not +-1; they still
        // sum to zero. Do not round these to +-1.
        (Quad, V) => Some(&[(45.0, 0.7981), (-135.0, 1.0), (-45.0, -0.7981), (135.0, -1.0)]),
        // AP_MotorsMatrix.cpp setup_quad_matrix, case MOTOR_FRAME_TYPE_BF_X (SIM_Frame.cpp quad_bf_x_motors).
        (Quad, BetaFlightX) => Some(&[(135.0, -1.0), (45.0, 1.0), (-135.0, 1.0), (-45.0, -1.0)]),

        // AP_MotorsMatrix.cpp setup_hexa_matrix, case MOTOR_FRAME_TYPE_PLUS (SIM_Frame.cpp hexa_motors).
        (Hexa, X) => Some(&[
            (0.0, -1.0), (180.0, 1.0), (-120.0, -1.0),
            (60.0, 1.0), (-60.0, 1.0), (120.0, -1.0),
        ]),
        // AP_MotorsMatrix.cpp setup_hexa_matrix, case MOTOR_FRAME_TYPE_X (SIM_Frame.cpp hexax_motors).
        // See porting note above on why this is the "X"-labeled AP case despite being FrameType::Plus here.
        (Hexa, Plus) => Some(&[
            (90.0, -1.0), (-90.0, 1.0), (-30.0, -1.0),
            (150.0, 1.0), (30.0, 1.0), (-150.0, -1.0),
        ]),

        // AP_MotorsMatrix.cpp setup_octa_matrix, case MOTOR_FRAME_TYPE_PLUS (SIM_Frame.cpp octa_motors).
        (Octa, X) => Some(&[
            (0.0, -1.0), (180.0, -1.0), (45.0, 1.0), (135.0, 1.0),
            (-45.0, 1.0), (-135.0, 1.0), (-90.0, -1.0), (90.0, -1.0),
        ]),
        // AP_MotorsMatrix.cpp setup_octa_matrix, case MOTOR_FRAME_TYPE_X. No separate
        // SIM_Frame.cpp preset exists for this arrangement; AP_MotorsMatrix.cpp is
        // authoritative (it is the table the flight controller actually runs).
        // See porting note above on why this is the "X"-labeled AP case despite being FrameType::Plus here.
        (Octa, Plus) => Some(&[
            (22.5, -1.0), (-157.5, -1.0), (67.5, 1.0), (157.5, 1.0),
            (-22.5, 1.0), (-112.5, 1.0), (-67.5, -1.0), (112.5, -1.0),
        ]),

        // AP_MotorsMatrix.cpp setup_deca_matrix, case MOTOR_FRAME_TYPE_X / MOTOR_FRAME_TYPE_CW_X
        // (SIM_Frame.cpp deca_cw_x_motors). Matches AP's own X label directly, no swap.
        (Deca, X) => Some(&[
            (18.0, 1.0), (54.0, -1.0), (90.0, 1.0), (126.0, -1.0), (162.0, 1.0),
            (-162.0, -1.0), (-126.0, 1.0), (-90.0, -1.0), (-54.0, 1.0), (-18.0, -1.0),
        ]),

        // AP_MotorsMatrix.cpp setup_dodecahexa_matrix, case MOTOR_FRAME_TYPE_X
        // (SIM_Frame.cpp dodeca_hexa_motors). Matches AP's own X label directly, no swap.
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
    fn hexa_x_matches_stock_sitl() {
        let m = motor_factors(FrameClass::Hexa, FrameType::X).unwrap();
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
    fn octa_x_matches_stock_sitl() {
        let m = motor_factors(FrameClass::Octa, FrameType::X).unwrap();
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
