package com.powerlifting.orchestrator.programs.model;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/**
 * The normalize result. Plain JSON, not a stream — a single structured document
 * gains nothing from streaming.
 *
 * <p>Doubles as the shape the model is asked to produce: the runtime parses the
 * model's JSON into this record, then assigns node ids to {@code program}.
 * A rejection ({@code isProgram = false}) carries a {@code reason} and no
 * program; a success carries a program and no reason. The distinction is
 * load-bearing — the two map to different request outcomes and metric labels.
 */
@JsonPropertyOrder({"is_program", "reason", "program"})
public record ProgramNormalizeResponse(
        boolean isProgram,
        String reason,
        Program program) {

    public static ProgramNormalizeResponse rejected(String reason) {
        return new ProgramNormalizeResponse(false, reason, null);
    }

    public static ProgramNormalizeResponse of(Program program) {
        return new ProgramNormalizeResponse(true, null, program);
    }
}
