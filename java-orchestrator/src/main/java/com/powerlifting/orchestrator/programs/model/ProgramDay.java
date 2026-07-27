package com.powerlifting.orchestrator.programs.model;

import java.util.List;

/**
 * One training day. {@code label} is invented ("Day 1") by the normalizer when
 * the source text does not name it. Part of the wire contract.
 */
public record ProgramDay(
        String id,
        String label,
        List<ExercisePrescription> exercises,
        String notes) {

    public ProgramDay {
        id = id != null ? id : "";
        exercises = exercises != null ? List.copyOf(exercises) : List.of();
    }

    public ProgramDay withId(String newId) {
        return new ProgramDay(newId, label, exercises, notes);
    }

    public ProgramDay withExercises(List<ExercisePrescription> newExercises) {
        return new ProgramDay(id, label, newExercises, notes);
    }
}
