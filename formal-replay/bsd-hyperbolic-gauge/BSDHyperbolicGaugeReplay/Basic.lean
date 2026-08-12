import Mathlib

/-!
# Hyperbolic Lagrangian gauge for signed BSD/Iwasawa local conditions

Independent public replay of the formal core committed privately at
`stevemoraco/RH-Lean@a5f5796222105e24f67ff7d34dd6b66e4c671563`.
-/

namespace BSDHyperbolicGauge

section

variable {R : Type*} [CommRing R]

/-- The symmetric hyperbolic pairing on `R × R`. -/
def hyperbolicPair (x y : R × R) : R := x.1 * y.2 + x.2 * y.1

/-- The diagonal gauge attached to a unit and its inverse. -/
def gauge (u : Rˣ) (x : R × R) : R × R :=
  ((u : R) * x.1, ((u⁻¹ : Rˣ) : R) * x.2)

/-- Every unit-valued diagonal gauge preserves the hyperbolic pairing. -/
theorem gauge_preserves_hyperbolicPair (u : Rˣ) (x y : R × R) :
    hyperbolicPair (gauge u x) (gauge u y) = hyperbolicPair x y := by
  dsimp [hyperbolicPair, gauge]
  calc
    ((u : R) * x.1) * ((↑(u⁻¹) : R) * y.2) +
          ((↑(u⁻¹) : R) * x.2) * ((u : R) * y.1) =
        ((u : R) * (↑(u⁻¹) : R)) * (x.1 * y.2 + x.2 * y.1) := by
          ring
    _ = x.1 * y.2 + x.2 * y.1 := by simp

/-- Every unit-valued diagonal gauge preserves the positive coordinate line. -/
theorem gauge_preserves_first_axis (u : Rˣ) (x : R) :
    (gauge u (x, 0)).2 = 0 := by
  simp [gauge]

/-- Every unit-valued diagonal gauge preserves the negative coordinate line. -/
theorem gauge_preserves_second_axis (u : Rˣ) (y : R) :
    (gauge u (0, y)).1 = 0 := by
  simp [gauge]

/-- A general diagonal unit action. -/
def diagonalAction (a d : Rˣ) (x : R × R) : R × R :=
  ((a : R) * x.1, (d : R) * x.2)

/-- A diagonal unit action preserving the hyperbolic pairing must use inverse
scalars on the two Lagrangian lines. -/
theorem diagonal_pairing_preserver_forces_inverse
    (a d : Rˣ)
    (h : ∀ x y : R × R,
      hyperbolicPair (diagonalAction a d x) (diagonalAction a d y) =
        hyperbolicPair x y) :
    d = a⁻¹ := by
  have hadR : (a : R) * (d : R) = 1 := by
    simpa [hyperbolicPair, diagonalAction] using h (1, 0) (0, 1)
  have had : a * d = 1 := by
    apply Units.ext
    simpa using hadR
  calc
    d = 1 * d := by simp
    _ = (a⁻¹ * a) * d := by simp
    _ = a⁻¹ * (a * d) := by simp
    _ = a⁻¹ := by rw [had]; simp

/-- Pairing plus the two labelled Lagrangians has stabilizer exactly `Rˣ`. -/
theorem diagonal_pairing_preserver_iff
    (a d : Rˣ) :
    (∀ x y : R × R,
      hyperbolicPair (diagonalAction a d x) (diagonalAction a d y) =
        hyperbolicPair x y) ↔ d = a⁻¹ := by
  constructor
  · exact diagonal_pairing_preserver_forces_inverse a d
  · intro hd x y
    subst d
    simpa [diagonalAction, gauge] using gauge_preserves_hyperbolicPair a x y

end

section NormOne

variable {U : Type*} [CommGroup U]

/-- Compatibility with a sign-swapping involution is the norm-one equation. -/
theorem inverse_involution_iff_norm_one
    (ι : U →* U) (u : U) :
    ι u = u⁻¹ ↔ u * ι u = 1 := by
  constructor
  · intro h
    rw [h]
    exact mul_inv_cancel u
  · intro h
    have hx := congrArg (fun z => u⁻¹ * z) h
    simpa [mul_assoc] using hx

/-- If the same residual gauge is both involution-fixed and norm one, it is
2-torsion. -/
theorem fixed_and_norm_one_forces_square_one
    (ι : U →* U) (u : U)
    (hfixed : ι u = u) (hnorm : u * ι u = 1) :
    u ^ 2 = 1 := by
  simpa [pow_two, hfixed] using hnorm

end NormOne

section Exactification

variable {R : Type*} [CommRing R] [NoZeroDivisors R]

/-- In a domain, a gauge fixed by the involution and of norm one is a sign. -/
theorem fixed_norm_one_is_sign
    (ι : R →+* R) (u : R)
    (hfixed : ι u = u) (hnorm : u * ι u = 1) :
    u = 1 ∨ u = -1 := by
  have hsquare : u ^ 2 = 1 := by
    simpa [pow_two, hfixed] using hnorm
  have hfac : (u - 1) * (u + 1) = 0 := by
    calc
      (u - 1) * (u + 1) = u ^ 2 - 1 := by ring
      _ = 0 := by rw [hsquare]; ring
  rcases mul_eq_zero.mp hfac with h | h
  · left
    exact sub_eq_zero.mp h
  · right
    calc
      u = (u + 1) - 1 := by ring
      _ = 0 - 1 := by rw [h]
      _ = -1 := by ring

end Exactification

end BSDHyperbolicGauge

#print axioms BSDHyperbolicGauge.gauge_preserves_hyperbolicPair
#print axioms BSDHyperbolicGauge.diagonal_pairing_preserver_iff
#print axioms BSDHyperbolicGauge.inverse_involution_iff_norm_one
#print axioms BSDHyperbolicGauge.fixed_norm_one_is_sign
