package com.powerlifting.orchestrator.stream;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import com.powerlifting.orchestrator.programs.model.Suggestion;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The NDJSON event vocabulary — every kind of line this service writes to the
 * response stream. Part of the wire contract with the gateway.
 *
 * <p>The gateway ignores event types it does not know, so new types can be
 * added without breaking it (see web/src/lib/orchestrator.ts).
 *
 * <p>These events are only ever <em>written</em> by this service, never read,
 * so the discriminator is produced by the {@link #type()} getter rather than
 * Jackson polymorphic type handling. If something ever needs to deserialize
 * them, add {@code @JsonTypeInfo}/{@code @JsonSubTypes} here.
 *
 * <p>Sealed on purpose: a {@code switch} over these is exhaustive at compile
 * time, so adding an event type surfaces every place that must handle it.
 */
public sealed interface StreamEvent {

    @JsonProperty("type")
    String type();

    /** Answer text delta. The gateway forwards these straight to the browser. */
    @JsonPropertyOrder({"type", "text"})
    record Token(String text) implements StreamEvent {
        @Override public String type() { return "token"; }
    }

    /**
     * One retrieved source. {@code id} is int-or-string on the wire.
     *
     * <p>Defensive copies here and in {@link Metrics} use
     * {@code unmodifiableMap(new LinkedHashMap<>(..))} rather than
     * {@code Map.copyOf}: {@code Map.copyOf} returns a map whose iteration
     * order is deliberately unspecified, which silently scrambles the JSON
     * field order of anything built as a LinkedHashMap.
     */
    @JsonPropertyOrder({"id", "similarity", "hybrid_score", "metadata"})
    record Citation(Object id, Double similarity, Double hybridScore, Map<String, Object> metadata) {
        public Citation {
            metadata = metadata != null
                    ? Collections.unmodifiableMap(new LinkedHashMap<>(metadata))
                    : Map.of();
        }
    }

    @JsonPropertyOrder({"type", "items"})
    record Citations(List<Citation> items) implements StreamEvent {
        public Citations {
            items = items != null ? List.copyOf(items) : List.of();
        }
        @Override public String type() { return "citations"; }
    }

    /**
     * Emitted only on turns where the runtime refreshed the rolling summary.
     * The gateway encrypts and persists it.
     */
    @JsonPropertyOrder({"type", "text"})
    record Summary(String text) implements StreamEvent {
        @Override public String type() { return "summary"; }
    }

    /** Per-request observability. Not shown to users; the gateway logs it. */
    @JsonPropertyOrder({"type", "data"})
    record Metrics(Map<String, Object> data) implements StreamEvent {
        public Metrics {
            data = data != null
                    ? Collections.unmodifiableMap(new LinkedHashMap<>(data))
                    : Map.of();
        }
        @Override public String type() { return "metrics"; }
    }

    @JsonPropertyOrder({"type"})
    record End() implements StreamEvent {
        @Override public String type() { return "end"; }
    }

    @JsonPropertyOrder({"type", "message"})
    record Error(String message) implements StreamEvent {
        @Override public String type() { return "error"; }
    }

    // --- Program suggest stream. These share the one event vocabulary (and so
    //     the one NdjsonSink) rather than defining a parallel stream: the
    //     gateway already tolerates unknown types, so chat and programs can
    //     draw from the same sealed set. ---

    /** The 2-3 sentence overall read of a program, sent before its suggestions. */
    @JsonPropertyOrder({"type", "text"})
    record Assessment(String text) implements StreamEvent {
        @Override public String type() { return "assessment"; }
    }

    /**
     * One validated suggestion, emitted as soon as its JSONL line completes so
     * cards appear one at a time in the editor.
     */
    @JsonPropertyOrder({"type", "suggestion"})
    record SuggestionEvent(Suggestion suggestion) implements StreamEvent {
        @Override public String type() { return "suggestion"; }
    }
}
