package com.powerlifting.orchestrator.observability;

import static org.assertj.core.api.Assertions.assertThat;

import com.powerlifting.orchestrator.chat.runtime.Verifier;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Folding {@link RequestMetrics} into meters is a pure function of the registry,
 * so it is tested directly against a {@link SimpleMeterRegistry} — no Spring
 * context, no scrape endpoint. Guards the meter names/tags (a rename silently
 * blanks the dashboards) and the counting rules.
 */
class InstrumentationTest {

    private MeterRegistry registry;
    private Instrumentation instrumentation;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        instrumentation = new Instrumentation(registry);
    }

    private double counter(String name, String... tags) {
        return registry.get(name).tags(tags).counter().count();
    }

    @Test
    void boundedSeriesArePreRegisteredAtZero() {
        // Before any request, the outcome series must already exist so rate()
        // reads 0 instead of "no data".
        assertThat(counter("chat.requests", "outcome", "ok")).isZero();
        assertThat(counter("chat.requests", "outcome", "error")).isZero();
        assertThat(counter("tool.calls", "tool", "get_lifter_history", "status", "ok")).isZero();
        assertThat(counter("verifier.issues", "issue", Verifier.EMPTY_ANSWER)).isZero();
    }

    @Test
    void aSuccessfulRequestIncrementsTheOkOutcome() {
        instrumentation.recordRequest(new RequestMetrics("u", "c"), Instrumentation.OUTCOME_OK);

        assertThat(counter("chat.requests", "outcome", "ok")).isEqualTo(1);
        assertThat(counter("chat.requests", "outcome", "error")).isZero();
    }

    @Test
    void tokensAreCountedByKindAndModel() {
        RequestMetrics metrics = new RequestMetrics("u", "c");
        metrics.setGeneratorModel("openai/gpt-4.1-mini");
        metrics.addUsage(120, 40);

        instrumentation.recordRequest(metrics, Instrumentation.OUTCOME_OK);

        assertThat(counter("llm.tokens", "kind", "prompt", "model", "openai/gpt-4.1-mini"))
                .isEqualTo(120);
        assertThat(counter("llm.tokens", "kind", "completion", "model", "openai/gpt-4.1-mini"))
                .isEqualTo(40);
    }

    @Test
    void toolCallsSplitIntoOkAndErrorByOccurrence() {
        // Two calls to the same tool, one of which errored: 1 ok + 1 error.
        RequestMetrics metrics = new RequestMetrics("u", "c");
        metrics.toolsUsed().add("get_lifter_history");
        metrics.toolsUsed().add("get_lifter_history");
        metrics.toolErrors().add("get_lifter_history");

        instrumentation.recordRequest(metrics, Instrumentation.OUTCOME_OK);

        assertThat(counter("tool.calls", "tool", "get_lifter_history", "status", "ok"))
                .isEqualTo(1);
        assertThat(counter("tool.calls", "tool", "get_lifter_history", "status", "error"))
                .isEqualTo(1);
    }

    @Test
    void verifierIssuesAreCounted() {
        RequestMetrics metrics = new RequestMetrics("u", "c");
        metrics.setVerifierIssues(List.of(Verifier.RETRIEVAL_PLANNED_BUT_NO_DOCS));

        instrumentation.recordRequest(metrics, Instrumentation.OUTCOME_OK);

        assertThat(counter("verifier.issues", "issue", Verifier.RETRIEVAL_PLANNED_BUT_NO_DOCS))
                .isEqualTo(1);
    }

    @Test
    void stageLatenciesAndDocCountsAreRecorded() {
        RequestMetrics metrics = new RequestMetrics("u", "c");
        metrics.time("planner", () -> null);
        metrics.setDocsRetrieved(5);

        instrumentation.recordRequest(metrics, Instrumentation.OUTCOME_OK);

        assertThat(registry.get("chat.stage.duration").tag("stage", "planner").timer().count())
                .isEqualTo(1);
        assertThat(registry.get("docs.retrieved").summary().totalAmount()).isEqualTo(5);
    }
}
