package com.powerlifting.orchestrator.programs.model;

import jakarta.validation.constraints.Size;

/**
 * The request for AI suggestions on a program. {@code instruction} is the
 * user's optional targeted ask ("make day 2 easier"); when absent the runtime
 * gives a general review.
 *
 * <p>The program is not bean-validated for content here: the editor legitimately
 * sends work-in-progress (a blank exercise name on a half-filled row), and the
 * suggester tolerates it. Only the normalizer, whose input is a model, holds the
 * program to a strict shape.
 */
public record ProgramSuggestRequest(
        String userId,
        Program program,
        @Size(max = 500) String instruction) {
}
