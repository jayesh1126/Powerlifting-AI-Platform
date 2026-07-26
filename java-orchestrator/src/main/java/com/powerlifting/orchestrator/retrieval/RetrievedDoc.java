package com.powerlifting.orchestrator.retrieval;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One retrieved chunk.
 *
 * <p>{@code similarity} is always null from {@code match_knowledge_v3}: the RPC
 * fuses vector and keyword results by Reciprocal Rank Fusion and returns only
 * the fused {@code score}, so there is no standalone cosine value to report.
 * The field is kept because the wire contract and the older RPC both have it.
 */
public record RetrievedDoc(
        Object id,
        String content,
        Double similarity,
        Double hybridScore,
        String title,
        String author,
        String sourceUrl,
        List<String> topics) {

    public RetrievedDoc {
        topics = topics != null ? List.copyOf(topics) : List.of();
    }

    /**
     * The citation metadata shape the gateway reads
     * (web/src/lib/orchestrator.ts maps title/author/source_url).
     */
    public Map<String, Object> toCitationMetadata() {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("title", title);
        metadata.put("author", author);
        metadata.put("source_url", sourceUrl);
        metadata.put("topics", topics);
        return metadata;
    }
}
