package com.powerlifting.orchestrator.programs.model;

import java.util.List;

/**
 * A canonical training program: the structured form the gateway persists and
 * the editor renders. Part of the wire contract (mirrors
 * {@code web/src/lib/program.ts}).
 *
 * <p>{@code warnings} carries the normalizer's notes about anything it could
 * not structure, so a lossy parse is visible to the user rather than silently
 * dropped.
 */
public record Program(
        String title,
        List<ProgramWeek> weeks,
        String notes,
        List<String> warnings) {

    public Program {
        weeks = weeks != null ? List.copyOf(weeks) : List.of();
        warnings = warnings != null ? List.copyOf(warnings) : List.of();
    }

    public Program withWeeks(List<ProgramWeek> newWeeks) {
        return new Program(title, newWeeks, notes, warnings);
    }
}
