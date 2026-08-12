import Mathlib

namespace BSDHyperbolicGauge

section Hyperbolic
variable {R : Type*} [CommRing R]

def hyperbolicPair (x y : R × R) : R := x.1 * y.2 + x.2 * y.1

def gauge (u : Rˣ) (x : R × R) : R × R :=
  ((u : R) * x.1, ((u⁻¹ : Rˣ) : R) * x.2)

theorem gauge_preserves_hyperbolicPair (u : Rˣ) (x y : R × R) :
    hyperbolicPair (gauge u x) (gauge u y) = hyperbolicPair x y := by
  dsimp [hyperbolicPair, gauge]
  calc
    ((u : R) * x.1) * ((↑(u⁻¹) : R) * y.2) +
          ((↑(u⁻¹) : R) * x.2) * ((u : R) * y.1) =
        ((u : R) * (↑(u⁻¹) : R)) * (x.1 * y.2 + x.2 * y.1) := by ring
    _ = x.1 * y.2 + x.2 * y.1 := by simp

theorem gauge_preserves_first_axis (u : Rˣ) (x : R) :
    (gauge u (x, 0)).2 = 0 := by simp [gauge]

theorem gauge_preserves_second_axis (u : Rˣ) (y : R) :
    (gauge u (0, y)).1 = 0 := by simp [gauge]

def diagonalAction (a d : Rˣ) (x : R × R) : R × R :=
  ((a : R) * x.1, (d : R) * x.2)

theorem diagonal_pairing_preserver_forces_inverse
    (a d : Rˣ)
    (h : ∀ x y : R × R,
      hyperbolicPair (diagonalAction a d x) (diagonalAction a d y) =
        hyperbolicPair x y) : d = a⁻¹ := by
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

theorem diagonal_pairing_preserver_iff (a d : Rˣ) :
    (∀ x y : R × R,
      hyperbolicPair (diagonalAction a d x) (diagonalAction a d y) =
        hyperbolicPair x y) ↔ d = a⁻¹ := by
  constructor
  · exact diagonal_pairing_preserver_forces_inverse a d
  · intro hd x y
    subst d
    simpa [diagonalAction, gauge] using gauge_preserves_hyperbolicPair a x y
end Hyperbolic

section NormOne
variable {U : Type*} [CommGroup U]

theorem inverse_involution_iff_norm_one (ι : U →* U) (u : U) :
    ι u = u⁻¹ ↔ u * ι u = 1 := by
  constructor
  · intro h
    rw [h]
    exact mul_inv_cancel u
  · intro h
    have hx := congrArg (fun z => u⁻¹ * z) h
    simpa [mul_assoc] using hx

theorem norm_one_is_coboundary
    (ι : U →* U)
    (hsq : Function.Bijective (fun x : U => x ^ 2))
    (u : U) (hnorm : u * ι u = 1) :
    ∃ w : U, u = w * (ι w)⁻¹ := by
  rcases hsq.2 u with ⟨w, hw⟩
  have hiu : ι u = u⁻¹ :=
    (inverse_involution_iff_norm_one ι u).2 hnorm
  have hsquares : (ι w) ^ 2 = (w⁻¹) ^ 2 := by
    calc
      (ι w) ^ 2 = ι (w ^ 2) := by simp
      _ = ι u := by rw [hw]
      _ = u⁻¹ := hiu
      _ = (w ^ 2)⁻¹ := by
        exact (congrArg (fun x : U => x⁻¹) hw).symm
      _ = (w⁻¹) ^ 2 := by simp
  have hiw : ι w = w⁻¹ := hsq.1 hsquares
  refine ⟨w, ?_⟩
  rw [hiw]
  simpa [pow_two] using hw.symm

theorem coboundary_is_norm_one
    (ι : U →* U) (hι : Function.Involutive ι) (w : U) :
    let u := w * (ι w)⁻¹
    u * ι u = 1 := by
  dsimp
  simp [hι w, mul_comm, mul_left_comm, mul_assoc]

theorem norm_one_iff_coboundary
    (ι : U →* U) (hι : Function.Involutive ι)
    (hsq : Function.Bijective (fun x : U => x ^ 2))
    (u : U) :
    u * ι u = 1 ↔ ∃ w : U, u = w * (ι w)⁻¹ := by
  constructor
  · exact norm_one_is_coboundary ι hsq u
  · rintro ⟨w, rfl⟩
    exact coboundary_is_norm_one ι hι w

theorem fixed_and_norm_one_forces_square_one
    (ι : U →* U) (u : U)
    (hfixed : ι u = u) (hnorm : u * ι u = 1) : u ^ 2 = 1 := by
  simpa [pow_two, hfixed] using hnorm
end NormOne

section Exactification
variable {R : Type*} [CommRing R] [NoZeroDivisors R]

theorem fixed_norm_one_is_sign
    (ι : R →+* R) (u : R)
    (hfixed : ι u = u) (hnorm : u * ι u = 1) :
    u = 1 ∨ u = -1 := by
  have hsquare : u ^ 2 = 1 := by simpa [pow_two, hfixed] using hnorm
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
#print axioms BSDHyperbolicGauge.norm_one_iff_coboundary
#print axioms BSDHyperbolicGauge.fixed_norm_one_is_sign
