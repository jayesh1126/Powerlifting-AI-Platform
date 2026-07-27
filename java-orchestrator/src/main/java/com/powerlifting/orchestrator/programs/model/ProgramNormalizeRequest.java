package com.powerlifting.orchestrator.programs.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The request to normalize pasted program text.
 *
 * <p>The gateway has already applied its own UX floor (a longer minimum paste);
 * the {@code @Size} ceiling here mirrors the gateway's cap so both boundaries
 * agree, and is the last guard before the text reaches a model.
 */
public record ProgramNormalizeRequest(
        String userId,
        @NotBlank @Size(max = 12_000) String programText) {
}
