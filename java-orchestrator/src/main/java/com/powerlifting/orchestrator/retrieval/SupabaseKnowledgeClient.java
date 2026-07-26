package com.powerlifting.orchestrator.retrieval;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.powerlifting.orchestrator.config.OrchestratorProperties;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

/**
 * Calls the Supabase {@code match_knowledge_v3} hybrid-search RPC over
 * PostgREST.
 *
 * <p>Authenticates with the Supabase <em>secret</em> (service_role) key. The
 * corpus is not public data: RLS is enabled on
 * {@code knowledge_base_embeddings_v2} with no policies, and EXECUTE on the RPC
 * is revoked from anon/authenticated, so only a service-role caller sees rows.
 * That key must never reach a browser.
 *
 * <p>Blocking {@link RestClient} rather than {@code WebClient}: on a virtual
 * thread the blocking call parks and releases its carrier, so the reactive
 * client would add colouring for nothing.
 */
@Component
@Slf4j
public class SupabaseKnowledgeClient {

    private static final String RPC_PATH = "/rest/v1/rpc/match_knowledge_v3";
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(15);

    private static final ParameterizedTypeReference<List<Row>> ROWS =
            new ParameterizedTypeReference<>() { };

    /**
     * One RPC result row. The RPC returns provenance flat, not nested, so this
     * is reshaped into {@link RetrievedDoc} for the rest of the runtime.
     *
     * <p>Wire names are pinned explicitly rather than left to the global
     * snake_case strategy. This {@link RestClient} is built standalone, so it
     * uses default message converters with their own ObjectMapper and does NOT
     * inherit {@code spring.jackson.property-naming-strategy} — which silently
     * left {@code source_url} null and stripped the links out of every citation.
     * These names belong to PostgREST, not to us, so pinning them is also the
     * more honest description of the contract.
     */
    record Row(
            @JsonProperty("id") Object id,
            @JsonProperty("content") String content,
            @JsonProperty("score") Double score,
            @JsonProperty("title") String title,
            @JsonProperty("author") String author,
            @JsonProperty("source_url") String sourceUrl,
            @JsonProperty("topics") List<String> topics) {
    }

    private final OrchestratorProperties properties;
    private final ObjectMapper mapper;
    private final RestClient restClient;

    public SupabaseKnowledgeClient(OrchestratorProperties properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;

        // A connect timeout as well as a read timeout: the JDK HttpClient has no
        // default connect timeout, so an unreachable Supabase host would hang the
        // request thread until the OS gives up (minutes) instead of failing fast.
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = RestClient.builder().requestFactory(requestFactory).build();
    }

    public boolean isConfigured() {
        return properties.supabase().isConfigured();
    }

    /**
     * @return matching chunks, or an empty list on any failure — retrieval is
     *         best-effort and must never fail the user's request.
     */
    public List<RetrievedDoc> hybridSearch(float[] embedding, String queryText,
                                           List<String> topics, int matchCount) {
        if (!isConfigured()) {
            log.warn("Supabase not configured — retrieval returns nothing");
            return List.of();
        }

        String baseUrl = properties.supabase().url().replaceAll("/+$", "");
        String key = properties.supabase().secretKey();

        Map<String, Object> payload = Map.of(
                // A JSON *string*, not an array. PostgREST passes the argument
                // straight to a pgvector parameter, which parses its own text
                // representation; sending a JSON array is rejected. This is the
                // single easiest thing to get wrong in the whole retrieval path.
                "query_embedding", toVectorLiteral(embedding),
                "query_text", queryText,
                "topics", topics,
                "match_count", matchCount);

        try {
            List<Row> rows = restClient.post()
                    .uri(baseUrl + RPC_PATH)
                    .header("apikey", key)
                    .header("Authorization", "Bearer " + key)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(ROWS);

            if (rows == null) {
                log.warn("hybrid search RPC returned no body");
                return List.of();
            }
            return rows.stream().map(SupabaseKnowledgeClient::toDoc).toList();
        } catch (Exception e) {
            log.warn("hybrid search RPC failed: {}", e.toString());
            return List.of();
        }
    }

    private static RetrievedDoc toDoc(Row row) {
        return new RetrievedDoc(
                row.id(),
                row.content(),
                null,             // the RRF RPC reports no standalone similarity
                row.score(),
                row.title(),
                row.author(),
                row.sourceUrl(),
                row.topics());
    }

    private String toVectorLiteral(float[] embedding) {
        return mapper.writeValueAsString(embedding);
    }
}
