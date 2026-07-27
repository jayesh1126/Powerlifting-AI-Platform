package com.powerlifting.orchestrator.programs.model;

/**
 * One prescribed exercise. Part of the wire contract with the gateway
 * (mirrors {@code web/src/lib/program.ts}); wire names are snake_case via the
 * global Jackson naming strategy ({@code reps_min}, {@code superset_group}).
 *
 * <p>Every value except {@code name} is optional, because a normalized program
 * comes from messy pasted text: a missing sets/reps/RPE is normal, and
 * {@code raw} preserves a line that resisted structuring so nothing is lost
 * silently.
 *
 * <p>{@code id} is a stable node id ("w1d2e3"), assigned by {@link
 * com.powerlifting.orchestrator.programs.runtime.NodeIds} after the normalizer
 * parses the model's output — the model never produces ids.
 */
public record ExercisePrescription(
        String id,
        String name,
        Integer sets,
        Integer repsMin,
        Integer repsMax,
        Boolean amrap,
        Double rpe,
        Double rpeMax,
        Double percentage,
        String supersetGroup,
        String notes,
        String raw) {

    public ExercisePrescription {
        id = id != null ? id : "";
        amrap = amrap != null && amrap;
    }

    public ExercisePrescription withId(String newId) {
        return new ExercisePrescription(newId, name, sets, repsMin, repsMax, amrap,
                rpe, rpeMax, percentage, supersetGroup, notes, raw);
    }
}
