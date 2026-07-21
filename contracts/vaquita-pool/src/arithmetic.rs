use crate::error::VaquitaPoolError;

pub fn checked_add(a: i128, b: i128) -> Result<i128, VaquitaPoolError> {
    a.checked_add(b).ok_or(VaquitaPoolError::ArithmeticOverflow)
}

pub fn checked_sub(a: i128, b: i128) -> Result<i128, VaquitaPoolError> {
    a.checked_sub(b).ok_or(VaquitaPoolError::ArithmeticOverflow)
}

pub fn checked_mul(a: i128, b: i128) -> Result<i128, VaquitaPoolError> {
    a.checked_mul(b).ok_or(VaquitaPoolError::ArithmeticOverflow)
}

pub fn checked_div(a: i128, b: i128) -> Result<i128, VaquitaPoolError> {
    if b == 0 {
        return Err(VaquitaPoolError::ArithmeticOverflow);
    }
    a.checked_div(b).ok_or(VaquitaPoolError::ArithmeticOverflow)
}
