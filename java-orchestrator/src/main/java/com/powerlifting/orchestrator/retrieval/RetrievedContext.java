package com.powerlifting.orchestrator.retrieval;

import java.util.List;

/**
 * Retrieval output. Deliberately prompt-free — documents and scores only; the
 * generator decides how to phrase them into context.
 */
public record RetrievedContext(
        List<RetrievedDoc> documents,
        String standaloneQuery,
        List<String> topics) {

    public RetrievedContext {
        documents = documents != null ? List.copyOf(documents) : List.of();
        topics = topics != null ? List.copyOf(topics) : List.of();
    }

    public static RetrievedContext empty() {
        return new RetrievedContext(List.of(), null, List.of());
    }

    public boolean isEmpty() {
        return documents.isEmpty();
    }
}
