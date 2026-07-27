package com.powerlifting.orchestrator.programs.model;

import java.util.List;

/**
 * One training week. {@code block} is an optional label (e.g. "hypertrophy"),
 * not a structural layer — most pasted programs are a flat list of weeks, so a
 * mandatory block level would force the normalizer to invent structure. Part of
 * the wire contract.
 */
public record ProgramWeek(
        String id,
        String label,
        String block,
        List<ProgramDay> days,
        String notes) {

    public ProgramWeek {
        id = id != null ? id : "";
        days = days != null ? List.copyOf(days) : List.of();
    }

    public ProgramWeek withId(String newId) {
        return new ProgramWeek(newId, label, block, days, notes);
    }

    public ProgramWeek withDays(List<ProgramDay> newDays) {
        return new ProgramWeek(id, label, block, newDays, notes);
    }
}
