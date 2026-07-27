package com.powerlifting.orchestrator.programs.model;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import java.util.Map;

/**
 * One discrete, individually acceptable edit to a program, streamed to the
 * client as a {@code suggestion} event. Part of the wire contract.
 *
 * <p>{@code id} is assigned by the runtime, never the model. {@code targetId}
 * points at the node the edit applies to (an exercise, day or week id), or is
 * {@code null} for a {@code program_note}. {@code payload} is a partial patch
 * (for {@code modify_exercise}) or a full new node (for {@code add_*}), kept as
 * a map so a partial patch carries exactly the fields the model chose to change
 * — the client applies it as-is.
 */
@JsonPropertyOrder({"id", "kind", "target_id", "payload", "rationale"})
public record Suggestion(
        String id,
        SuggestionKind kind,
        String targetId,
        Map<String, Object> payload,
        String rationale) {
}
