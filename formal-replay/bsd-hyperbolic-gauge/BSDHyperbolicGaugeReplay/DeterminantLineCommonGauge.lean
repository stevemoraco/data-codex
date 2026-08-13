import Mathlib

set_option autoImplicit false

namespace BSDDeterminantLine

section CommonGauge

variable {U : Type*} [CommGroup U]

def commonGauge (u a : U) : U := u⁻¹ * a

def relativeUnit (a b : U) : U := a * b⁻¹

theorem relativeUnit_commonGauge (u a b : U) :
    relativeUnit (commonGauge u a) (commonGauge u b) =
      relativeUnit a b := by
  simp [relativeUnit, commonGauge, mul_comm, mul_left_comm, mul_assoc]

theorem relativeUnit_independentGauge (u v a b : U) :
    relativeUnit (commonGauge u a) (commonGauge v b) =
      (u⁻¹ * v) * relativeUnit a b := by
  simp [relativeUnit, commonGauge, mul_comm, mul_left_comm, mul_assoc]

theorem commonGauge_eq_iff (u a b : U) :
    commonGauge u a = commonGauge u b ↔ a = b := by
  simp [commonGauge]

theorem relativeUnit_eq_one_iff (a b : U) :
    relativeUnit a b = 1 ↔ a = b := by
  constructor
  · intro h
    have h' := congrArg (fun z : U => z * b) h
    simpa [relativeUnit, mul_assoc] using h'
  · intro h
    subst b
    simp [relativeUnit]

theorem commonGauge_relativeUnit_eq_one_iff (u a b : U) :
    relativeUnit (commonGauge u a) (commonGauge u b) = 1 ↔ a = b := by
  rw [relativeUnit_commonGauge, relativeUnit_eq_one_iff]

theorem independentGauge_can_realize_any_ratio (a b target : U) :
    ∃ u v : U,
      relativeUnit (commonGauge u a) (commonGauge v b) = target := by
  refine ⟨1, target * (relativeUnit a b)⁻¹, ?_⟩
  rw [relativeUnit_independentGauge]
  simp [mul_comm, mul_left_comm, mul_assoc]

theorem independentGauge_can_force_equality (a b : U) :
    ∃ u v : U, commonGauge u a = commonGauge v b := by
  obtain ⟨u, v, h⟩ := independentGauge_can_realize_any_ratio a b 1
  exact ⟨u, v, (relativeUnit_eq_one_iff _ _).mp h⟩

end CommonGauge

section FiveTermTransport

variable {U : Type*} [CommGroup U]

def FiveTermBalance
    (relaxed signedTarget signedDisplayed strict : U) : Prop :=
  relaxed * signedTarget = signedDisplayed * strict

theorem fiveTerm_relativeUnit_transport
    (relaxed signedTarget signedDisplayed strict : U)
    (hbalance : FiveTermBalance relaxed signedTarget signedDisplayed strict) :
    relativeUnit relaxed strict = relativeUnit signedDisplayed signedTarget := by
  have h := congrArg
    (fun z : U => z * (strict⁻¹ * signedTarget⁻¹)) hbalance
  simpa [FiveTermBalance, relativeUnit, mul_comm, mul_left_comm, mul_assoc] using h

theorem fiveTerm_discrepancy_propagates
    (relaxed signedTarget signedDisplayed strict u : U)
    (hbalance : FiveTermBalance relaxed signedTarget signedDisplayed strict)
    (hrelaxed : relaxed = u * strict) :
    signedDisplayed = u * signedTarget := by
  have hcancel : (u * signedTarget) * strict = signedDisplayed * strict := by
    calc
      (u * signedTarget) * strict = (u * strict) * signedTarget := by
        ac_rfl
      _ = relaxed * signedTarget := by rw [← hrelaxed]
      _ = signedDisplayed * strict := hbalance
  exact mul_right_cancel hcancel

theorem exact_relaxed_implies_exact_signed
    (relaxed signedTarget signedDisplayed strict : U)
    (hbalance : FiveTermBalance relaxed signedTarget signedDisplayed strict)
    (hrelaxed : relaxed = strict) :
    signedDisplayed = signedTarget := by
  have h := fiveTerm_discrepancy_propagates
    relaxed signedTarget signedDisplayed strict 1 hbalance
    (by simpa using hrelaxed)
  simpa using h

theorem exact_signed_iff_exact_relaxed
    (relaxed signedTarget signedDisplayed strict : U)
    (hbalance : FiveTermBalance relaxed signedTarget signedDisplayed strict) :
    signedDisplayed = signedTarget ↔ relaxed = strict := by
  constructor
  · intro hsigned
    have hrel := fiveTerm_relativeUnit_transport
      relaxed signedTarget signedDisplayed strict hbalance
    rw [hsigned, relativeUnit_eq_one_iff] at hrel
    exact (relativeUnit_eq_one_iff relaxed strict).mp hrel
  · intro hrelaxed
    exact exact_relaxed_implies_exact_signed
      relaxed signedTarget signedDisplayed strict hbalance hrelaxed

end FiveTermTransport

end BSDDeterminantLine

#print axioms BSDDeterminantLine.relativeUnit_commonGauge
#print axioms BSDDeterminantLine.relativeUnit_independentGauge
#print axioms BSDDeterminantLine.commonGauge_eq_iff
#print axioms BSDDeterminantLine.relativeUnit_eq_one_iff
#print axioms BSDDeterminantLine.commonGauge_relativeUnit_eq_one_iff
#print axioms BSDDeterminantLine.independentGauge_can_realize_any_ratio
#print axioms BSDDeterminantLine.independentGauge_can_force_equality
#print axioms BSDDeterminantLine.fiveTerm_relativeUnit_transport
#print axioms BSDDeterminantLine.fiveTerm_discrepancy_propagates
#print axioms BSDDeterminantLine.exact_relaxed_implies_exact_signed
#print axioms BSDDeterminantLine.exact_signed_iff_exact_relaxed
