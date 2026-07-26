use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }
    pub fn add(self, o: Vec3) -> Vec3 {
        Vec3::new(self.x + o.x, self.y + o.y, self.z + o.z)
    }
    pub fn scale(self, s: f64) -> Vec3 {
        Vec3::new(self.x * s, self.y * s, self.z * s)
    }
    pub fn dot(self, o: Vec3) -> f64 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }
    pub fn norm(self) -> f64 {
        self.dot(self).sqrt()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Quat {
    pub w: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Quat {
    pub fn identity() -> Self {
        Self { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Mat3(pub [[f64; 3]; 3]);

impl Mat3 {
    pub fn zero() -> Self {
        Mat3([[0.0; 3]; 3])
    }
    pub fn add(self, o: Mat3) -> Mat3 {
        let mut r = Mat3::zero();
        for i in 0..3 {
            for j in 0..3 {
                r.0[i][j] = self.0[i][j] + o.0[i][j];
            }
        }
        r
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vec3_ops() {
        let a = Vec3::new(1.0, 2.0, 2.0);
        assert_eq!(a.norm(), 3.0);
        assert_eq!(a.scale(2.0), Vec3::new(2.0, 4.0, 4.0));
        assert_eq!(a.add(Vec3::new(1.0, 0.0, 0.0)), Vec3::new(2.0, 2.0, 2.0));
        assert_eq!(a.dot(Vec3::new(1.0, 0.0, 0.0)), 1.0);
    }

    #[test]
    fn mat3_add() {
        let z = Mat3::zero();
        let m = Mat3([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]);
        assert_eq!(z.add(m), m);
    }
}
