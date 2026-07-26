package com.powerlifting.orchestrator.observability;

import static org.assertj.core.api.Assertions.assertThat;

import com.powerlifting.orchestrator.stream.StreamEvent;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The metrics payload is the seed of the evaluation pipeline and is consumed by
 * the gateway, so its key names and order are part of the wire contract.
 */
class RequestMetricsTest {

    @Test
    void payloadKeysAndOrderMatchTheWireContract() {
        Map<String, Object> data = new RequestMetrics("u", "c").toMap();

        assertThat(data.keySet()).containsExactly(
                "latencies_ms", "prompt_tokens", "completion_tokens", "tools_used",
                "tool_errors", "docs_retrieved", "plan", "generator_model", "verifier_issues");
    }

    @Test
    void wrappingInAnEventPreservesKeyOrder() {
        // A LinkedHashMap-preserving copy is required: Map.copyOf leaves iteration
        // order unspecified, which would scramble the emitted JSON.
        Map<String, Object> data = new RequestMetrics("u", "c").toMap();

        assertThat(new StreamEvent.Metrics(data).data().keySet())
                .containsExactlyElementsOf(data.keySet());
    }

    @Test
    void usageAccumulatesAcrossCalls() {
        // Phase 3's tool loop makes several model calls per request; each one
        // must add to the request total rather than replace it.
        RequestMetrics metrics = new RequestMetrics("u", "c");
        metrics.addUsage(100, 20);
        metrics.addUsage(150, 30);

        assertThat(metrics.toMap()).containsEntry("prompt_tokens", 250)
                                   .containsEntry("completion_tokens", 50);
    }

    @Test
    void nullUsageIsTreatedAsZero() {
        RequestMetrics metrics = new RequestMetrics("u", "c");
        metrics.addUsage(null, null);

        assertThat(metrics.toMap()).containsEntry("prompt_tokens", 0);
    }

    @Test
    void timedStagesAreRecordedInMilliseconds() {
        RequestMetrics metrics = new RequestMetrics("u", "c");

        String result = metrics.time("planner", () -> "done");

        assertThat(result).isEqualTo("done");
        @SuppressWarnings("unchecked")
        Map<String, Double> latencies = (Map<String, Double>) metrics.toMap().get("latencies_ms");
        assertThat(latencies).containsKey("planner");
        assertThat(latencies.get("planner")).isNotNegative();
    }

    @Test
    void aStageIsStillTimedWhenItThrows() {
        RequestMetrics metrics = new RequestMetrics("u", "c");

        try {
            metrics.time("planner", () -> {
                throw new IllegalStateException("boom");
            });
        } catch (IllegalStateException expected) {
            // The point is that the timing survives the failure.
        }

        @SuppressWarnings("unchecked")
        Map<String, Double> latencies = (Map<String, Double>) metrics.toMap().get("latencies_ms");
        assertThat(latencies).containsKey("planner");
    }

    @Test
    void verifierIssuesAreCarriedThrough() {
        RequestMetrics metrics = new RequestMetrics("u", "c");
        metrics.setVerifierIssues(List.of("empty_answer"));

        assertThat(metrics.toMap()).containsEntry("verifier_issues", List.of("empty_answer"));
    }
}
