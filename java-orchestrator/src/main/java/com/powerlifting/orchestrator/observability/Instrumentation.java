package com.powerlifting.orchestrator.observability;

import com.powerlifting.orchestrator.chat.runtime.Verifier;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Aggregate metrics for the runtime.
 *
 * <p>{@link RequestMetrics} is the per-request record (logged, streamed to the
 * gateway, the seed for evaluation); this is the fleet-wide view folded from it
 * exactly once, when {@link #recordRequest} is called at the end of a turn. The
 * meters are exported at {@code /actuator/prometheus} by the autoconfigured
 * Prometheus registry.
 *
 * <p>Meter and tag names are chosen so the Prometheus exposition matches the
 * names the dashboards already query ({@code chat_requests_total},
 * {@code chat_stage_duration_seconds}, {@code llm_tokens_total},
 * {@code tool_calls_total}, {@code verifier_issues_total},
 * {@code docs_retrieved}). Micrometer converts the dotted names and appends the
 * {@code _total} / {@code _seconds} suffixes.
 *
 * <p><b>Cardinality rule (hard):</b> tag values must be bounded — stage, tool,
 * model, outcome, issue, kind. Never user id, chat id or request id; each unique
 * value is a new time series.
 */
@Component
public class Instrumentation {

    public static final String OUTCOME_OK = "ok";
    public static final String OUTCOME_ERROR = "error";

    // Same bucket boundaries the dashboards expect. Stage durations routinely
    // reach tens of seconds (the generation stage), so the buckets extend well
    // past Micrometer's sub-second defaults.
    private static final Duration[] STAGE_SLOS = {
            Duration.ofMillis(50), Duration.ofMillis(100), Duration.ofMillis(250),
            Duration.ofMillis(500), Duration.ofSeconds(1), Duration.ofMillis(2500),
            Duration.ofSeconds(5), Duration.ofSeconds(10), Duration.ofSeconds(20),
            Duration.ofSeconds(30), Duration.ofSeconds(60), Duration.ofSeconds(120)};

    // Micrometer forbids an SLO boundary of 0, so a request that retrieved
    // nothing lands in the le=1 bucket rather than a dedicated le=0 one. The
    // _count/_sum series still capture every request.
    private static final double[] DOCS_SLOS = {1, 2, 5, 10, 20};

    // The stages ChatService times, pre-registered so their series exist at zero.
    private static final List<String> KNOWN_STAGES =
            List.of("planner", "retrieval", "generation", "summary");

    // The tools the model can call, pre-registered × {ok, error}.
    private static final List<String> KNOWN_TOOLS =
            List.of("get_lifter_history", "leaderboard_query");

    private final MeterRegistry registry;
    private final Map<String, Timer> stageTimers = new HashMap<>();
    private final DistributionSummary docsRetrieved;

    public Instrumentation(MeterRegistry registry) {
        this.registry = registry;

        // Pre-register the bounded series so rate()/increase() over them read 0
        // rather than "no data" before the first occurrence — the dashboards
        // depend on this, together with their `or vector(0)` guards.
        for (String outcome : List.of(OUTCOME_OK, OUTCOME_ERROR)) {
            requestCounter(outcome);
        }
        for (String stage : KNOWN_STAGES) {
            stageTimers.put(stage, buildStageTimer(stage));
        }
        for (String tool : KNOWN_TOOLS) {
            toolCounter(tool, OUTCOME_OK);
            toolCounter(tool, OUTCOME_ERROR);
        }
        for (String issue : Verifier.ALL_ISSUES) {
            issueCounter(issue);
        }

        this.docsRetrieved = DistributionSummary.builder("docs.retrieved")
                .description("Documents retrieved per request")
                .serviceLevelObjectives(DOCS_SLOS)
                .register(registry);
    }

    /**
     * Folds one finished request into the aggregate meters.
     *
     * @param outcome {@link #OUTCOME_OK} or {@link #OUTCOME_ERROR}; a client
     *                disconnect is {@code ok}, not an error.
     */
    public void recordRequest(RequestMetrics metrics, String outcome) {
        requestCounter(outcome).increment();

        metrics.latenciesMs().forEach((stage, ms) ->
                stageTimers.computeIfAbsent(stage, this::buildStageTimer)
                        .record(Duration.ofNanos(Math.round(ms * 1_000_000))));

        String model = metrics.generatorModel() != null ? metrics.generatorModel() : "none";
        if (metrics.promptTokens() > 0) {
            tokenCounter("prompt", model).increment(metrics.promptTokens());
        }
        if (metrics.completionTokens() > 0) {
            tokenCounter("completion", model).increment(metrics.completionTokens());
        }

        recordToolCalls(metrics);

        for (String issue : metrics.verifierIssues()) {
            issueCounter(issue).increment();
        }

        docsRetrieved.record(metrics.docsRetrieved());
    }

    /**
     * A tool that appears in {@code toolErrors} once counts as one error and
     * (if it also ran successfully) that many oks — matching how a single
     * request can call the same tool several times.
     */
    private void recordToolCalls(RequestMetrics metrics) {
        Map<String, Long> used = countByName(metrics.toolsUsed());
        Map<String, Long> errored = countByName(metrics.toolErrors());

        used.forEach((tool, total) -> {
            long errors = errored.getOrDefault(tool, 0L);
            long ok = total - errors;
            if (ok > 0) {
                toolCounter(tool, OUTCOME_OK).increment(ok);
            }
            if (errors > 0) {
                toolCounter(tool, OUTCOME_ERROR).increment(errors);
            }
        });
    }

    private static Map<String, Long> countByName(List<String> names) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String name : names) {
            counts.merge(name, 1L, Long::sum);
        }
        return counts;
    }

    private Counter requestCounter(String outcome) {
        return registry.counter("chat.requests", "outcome", outcome);
    }

    private Counter tokenCounter(String kind, String model) {
        return registry.counter("llm.tokens", "kind", kind, "model", model);
    }

    private Counter toolCounter(String tool, String status) {
        return registry.counter("tool.calls", "tool", tool, "status", status);
    }

    private Counter issueCounter(String issue) {
        return registry.counter("verifier.issues", "issue", issue);
    }

    private Timer buildStageTimer(String stage) {
        return Timer.builder("chat.stage.duration")
                .description("Wall-clock duration of a runtime stage")
                .tag("stage", stage)
                .serviceLevelObjectives(STAGE_SLOS)
                .register(registry);
    }
}
