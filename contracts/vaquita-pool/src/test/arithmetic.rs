#![cfg(test)]
use crate::arithmetic;
use crate::error::VaquitaPoolError;

#[test]
fn checked_add_succeeds_on_valid_inputs() {
    assert_eq!(arithmetic::checked_add(2, 3), Ok(5));
    assert_eq!(arithmetic::checked_add(0, 0), Ok(0));
    assert_eq!(arithmetic::checked_add(-10, 10), Ok(0));
}

#[test]
fn checked_add_overflow_returns_error() {
    assert_eq!(
        arithmetic::checked_add(i128::MAX, 1),
        Err(VaquitaPoolError::ArithmeticOverflow)
    );
}

#[test]
fn checked_sub_succeeds_on_valid_inputs() {
    assert_eq!(arithmetic::checked_sub(5, 3), Ok(2));
    assert_eq!(arithmetic::checked_sub(0, 0), Ok(0));
}

#[test]
fn checked_sub_underflow_returns_error() {
    assert_eq!(
        arithmetic::checked_sub(i128::MIN, 1),
        Err(VaquitaPoolError::ArithmeticOverflow)
    );
}

#[test]
fn checked_mul_succeeds_on_valid_inputs() {
    assert_eq!(arithmetic::checked_mul(3, 4), Ok(12));
    assert_eq!(arithmetic::checked_mul(0, i128::MAX), Ok(0));
    assert_eq!(arithmetic::checked_mul(-2, 3), Ok(-6));
}

#[test]
fn checked_mul_overflow_returns_error() {
    assert_eq!(
        arithmetic::checked_mul(i128::MAX, 2),
        Err(VaquitaPoolError::ArithmeticOverflow)
    );
}

#[test]
fn checked_div_succeeds_on_valid_inputs() {
    assert_eq!(arithmetic::checked_div(12, 4), Ok(3));
    assert_eq!(arithmetic::checked_div(0, 100), Ok(0));
    assert_eq!(arithmetic::checked_div(-10, 2), Ok(-5));
}

#[test]
fn checked_div_by_zero_returns_error() {
    assert_eq!(
        arithmetic::checked_div(100, 0),
        Err(VaquitaPoolError::ArithmeticOverflow)
    );
    assert_eq!(
        arithmetic::checked_div(0, 0),
        Err(VaquitaPoolError::ArithmeticOverflow)
    );
}
