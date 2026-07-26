package com.powerlifting.orchestrator.observability;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import lombok.extern.slf4j.Slf4j;

/**
 * Per-request observability.
 *
 * <p>Every chat request produces one RequestMetrics: stage latencies, token
 * usage, which tools ran, what the planner decided, and any verifier issues.
 * It is logged and emitted as a trailing {@code metrics} stream event — never
 * shown to users, and the foundation for later evaluation. Its key names and
 * their order are part of the metrics event's wire contract.
 *
 * <p>Mutable and deliberately not thread-safe: one instance belongs to one
 * request and is written only from that request's own virtual thread.
 */
@Slf4j
public class RequestMetrics {

    private final String userId;
    private final String chatId;

    private final Map<String, Double> latenciesMs = new LinkedHashMap<>();
    private int promptTokens;
    private int completionTokens;
    private final List<String> toolsUsed = new ArrayList<>();
    private final List<String> toolErrors = new ArrayList<>();
    private int docsRetrieved;
    private Map<String, Object> plan = Map.of();
    private String generatorModel;
    private List<String> verifierIssues = List.of();

    public RequestMetrics(String userId, String chatId) {
        this.userId = userId;
        this.chatId = chatId;
    }

    /** Times a stage that produces a value. */
    public <T> T time(String stage, Supplier<T> work) {
        long start = System.nanoTime();
        try {
            return work.get();
        } finally {
            record(stage, start);
        }
    }

    /** Times a stage run purely for its side effects. */
    public void timeVoid(String stage, Runnable work) {
        long start = System.nanoTime();
        try {
            work.run();
        } finally {
            record(stage, start);
        }
    }

    private void record(String stage, long startNanos) {
        double ms = (System.nanoTime() - startNanos) / 1_000_000.0;
        latenciesMs.put(stage, Math.round(ms * 10) / 10.0);
    }

    /**
     * Accumulates one completed model call.
     *
     * <p>Callers must pass a whole call's totals, not per-chunk deltas: within
     * a stream the provider reports usage cumulatively, so the caller keeps the
     * latest figures and adds them once the stream closes. Adding per chunk
     * would multiply the totals; replacing here would lose every round but the
     * last once the tool loop makes several calls per request.
     */
    public void addUsage(Integer prompt, Integer completion) {
        this.promptTokens += prompt != null ? prompt : 0;
        this.completionTokens += completion != null ? completion : 0;
    }

    public void setPlan(Map<String, Object> plan) {
        this.plan = plan;
    }

    public void setGeneratorModel(String generatorModel) {
        this.generatorModel = generatorModel;
    }

    public void setVerifierIssues(List<String> verifierIssues) {
        this.verifierIssues = verifierIssues;
    }

    public void setDocsRetrieved(int docsRetrieved) {
        this.docsRetrieved = docsRetrieved;
    }

    public List<String> toolsUsed() {
        return toolsUsed;
    }

    public List<String> toolErrors() {
        return toolErrors;
    }

    // --- Accessors for aggregate instrumentation (Instrumentation reads these
    //     once at end of request; nothing else should need them). ---

    /** Stage name to wall-clock milliseconds. */
    public Map<String, Double> latenciesMs() {
        return latenciesMs;
    }

    public int promptTokens() {
        return promptTokens;
    }

    public int completionTokens() {
        return completionTokens;
    }

    public int docsRetrieved() {
        return docsRetrieved;
    }

    /** The generator model id, or null if generation never ran. */
    public String generatorModel() {
        return generatorModel;
    }

    public List<String> verifierIssues() {
        return verifierIssues;
    }

    /**
     * Keys are literal snake_case: this map is serialized as-is, and Jackson's
     * global naming strategy does not rewrite Map keys.
     */
    public Map<String, Object> toMap() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("latencies_ms", latenciesMs);
        out.put("prompt_tokens", promptTokens);
        out.put("completion_tokens", completionTokens);
        out.put("tools_used", toolsUsed);
        out.put("tool_errors", toolErrors);
        out.put("docs_retrieved", docsRetrieved);
        out.put("plan", plan);
        out.put("generator_model", generatorModel);
        out.put("verifier_issues", verifierIssues);
        return out;
    }

    public void log() {
        log.info("request metrics user={} chat={} {}", userId, chatId, toMap());
    }
}
