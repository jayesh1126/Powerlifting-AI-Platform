package com.powerlifting.orchestrator.programs.runtime;

/**
 * The validation shape for a {@code modify_exercise} payload — the mutable
 * fields of an exercise and nothing else (no {@code id}, no {@code raw}).
 *
 * <p>Used only to validate a suggestion's patch: a payload is strict-read into
 * this record with unknown-property failure on, so a key outside this set
 * (including {@code id}/{@code raw}) or a wrongly-typed value rejects the
 * suggestion. The patch that reaches the client is the model's original map,
 * which already carries exactly the fields it chose to change — this record
 * only says whether that map is well-formed.
 */
record ExercisePatch(
        String name,
        Integer sets,
        Integer repsMin,
        Integer repsMax,
        Boolean amrap,
        Double rpe,
        Double rpeMax,
        Double percentage,
        String supersetGroup,
        String notes) {
}
