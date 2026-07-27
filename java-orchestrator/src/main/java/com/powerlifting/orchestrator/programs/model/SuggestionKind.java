package com.powerlifting.orchestrator.programs.model;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * The closed vocabulary of edits the AI is allowed to propose. Closed on
 * purpose: because a suggestion can only be one of these, every suggestion is
 * validatable against the program before it reaches the client, and the client
 * can apply it with a simple switch. Anything the model cannot express here, it
 * cannot suggest.
 *
 * <p>The wire form is the snake_case string (e.g. {@code modify_exercise}) the
 * gateway and the model both use; {@link #wire()} produces it and
 * {@link #fromWire(String)} parses it, returning {@code null} for an
 * unrecognized value so the caller can drop the suggestion rather than throw.
 */
public enum SuggestionKind {
    MODIFY_EXERCISE("modify_exercise"),
    ADD_EXERCISE("add_exercise"),
    REMOVE_EXERCISE("remove_exercise"),
    ADD_DAY("add_day"),
    REMOVE_DAY("remove_day"),
    PROGRAM_NOTE("program_note");

    private final String wire;

    SuggestionKind(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    /** Parses a wire value, or {@code null} if it matches no kind. */
    public static SuggestionKind fromWire(String value) {
        if (value == null) {
            return null;
        }
        for (SuggestionKind kind : values()) {
            if (kind.wire.equals(value)) {
                return kind;
            }
        }
        return null;
    }
}
