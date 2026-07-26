package com.powerlifting.orchestrator.retrieval;

import com.powerlifting.orchestrator.config.ChatModelConfig;
import com.powerlifting.orchestrator.config.OrchestratorProperties;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.stereotype.Component;

/**
 * Knowledge retrieval over the pgvector chunks.
 *
 * <pre>
 *   query -&gt; rewrite + topic extraction (cheap LLM, structured output)
 *         -&gt; query embedding
 *         -&gt; Supabase RPC match_knowledge_v3 (vector + full-text, fused by RRF,
 *            topics boosting rather than filtering)
 *         -&gt; RetrievedContext
 * </pre>
 *
 * <p>Called from the chat service rather than from a Spring AI advisor, despite
 * retrieval being a textbook augment-the-prompt interceptor. Measured reason:
 * {@code BaseAdvisor} runs its {@code before}/{@code after} hooks via
 * {@code publishOn(Schedulers.boundedElastic())}, so advisor code on a
 * streaming call executes on a bounded <em>platform</em>-thread pool. Retrieval
 * is the slowest I/O in the request, so running it there would occupy a pooled
 * platform thread instead of parking a virtual one, and would lose the MDC
 * request id for every log line it emits. See PORT_PLAN.md 2.2.
 *
 * <p>Every failure degrades to fewer (or no) documents rather than propagating:
 * a worse answer beats a failed request, and the verifier records the gap.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class KnowledgeRetrievalService {

    private static final int DEFAULT_TOP_K = 5;

    private static final String REWRITE_SYSTEM_PROMPT = """
            You rewrite user queries for a powerlifting knowledge base.

            Your tasks:
            1. Produce a clean standalone version of the user's question.
            2. Produce a list of canonical topics relevant to the query.

            You MUST choose topics ONLY from this list:
            %s

            Rules:
            - Use ONLY items from the list above.
            - Choose ALL that are relevant. If unsure, pick a broader category.""";

    private final ChatClient chatClient;
    private final EmbeddingModel embeddingModel;
    private final SupabaseKnowledgeClient knowledgeClient;
    private final OrchestratorProperties properties;

    public RetrievedContext retrieve(String query, List<String> extraTopics) {
        return retrieve(query, extraTopics, DEFAULT_TOP_K);
    }

    public RetrievedContext retrieve(String query, List<String> extraTopics, int topK) {
        QueryRewrite rewrite = rewriteQuery(query);
        List<String> topics = CanonicalTopics.sanitize(rewrite.topics(), extraTopics);
        String standaloneQuery = rewrite.standaloneQuery();

        float[] embedding = embed(standaloneQuery);
        if (embedding == null) {
            return new RetrievedContext(List.of(), standaloneQuery, topics);
        }

        List<RetrievedDoc> documents =
                knowledgeClient.hybridSearch(embedding, standaloneQuery, topics, topK);
        log.info("retrieval returned {} docs", documents.size());
        return new RetrievedContext(documents, standaloneQuery, topics);
    }

    private float[] embed(String text) {
        try {
            return embeddingModel.embed(text);
        } catch (Exception e) {
            log.warn("embedding failed — retrieval returns nothing: {}", e.toString());
            return null;
        }
    }

    /** Falls back to the raw query with no topics when the call fails. */
    private QueryRewrite rewriteQuery(String query) {
        try {
            QueryRewrite rewrite = chatClient.prompt()
                    .options(ChatModelConfig.optionsFor(properties.models().planner())
                            .temperature(0.0)
                            .maxTokens(500))
                    .system(REWRITE_SYSTEM_PROMPT.formatted(CanonicalTopics.asPromptList()))
                    .user(query)
                    .call()
                    .entity(QueryRewrite.class);

            if (rewrite == null || rewrite.standaloneQuery() == null
                    || rewrite.standaloneQuery().isBlank()) {
                return new QueryRewrite(query, List.of());
            }
            // The rewritten query is user content — DEBUG only.
            log.debug("rewrite: {}", rewrite.standaloneQuery());
            log.info("query rewritten, topics={}",
                    CanonicalTopics.sanitize(rewrite.topics(), List.of()));
            return rewrite;
        } catch (Exception e) {
            log.warn("query rewrite failed, using raw query: {}", e.toString());
            return new QueryRewrite(query, List.of());
        }
    }
}
