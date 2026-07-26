package com.powerlifting.orchestrator.retrieval;

import com.fasterxml.jackson.annotation.JsonClassDescription;
import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import java.util.List;

/**
 * The rewrite model's output: a standalone question plus canonical topics.
 *
 * <p>Topics stay {@code List<String>} rather than an enum on purpose. An enum
 * would make the schema reject invalid topics outright — but a single
 * hallucinated value would then fail the whole parse and cost the good topics
 * with it. Filtering afterwards degrades one topic at a time, which is what
 * {@link CanonicalTopics#sanitize} does.
 */
@JsonClassDescription("A standalone search query and the canonical topics it relates to")
public record QueryRewrite(

        @JsonPropertyDescription("A clean, standalone version of the user's question, "
                + "understandable without the conversation history")
        String standaloneQuery,

        @JsonPropertyDescription("Canonical topics relevant to the query, chosen ONLY from "
                + "the allowed list given in the system prompt")
        List<String> topics) {

    public QueryRewrite {
        topics = topics != null ? List.copyOf(topics) : List.of();
    }
}
