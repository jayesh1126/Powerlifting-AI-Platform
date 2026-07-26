package com.powerlifting.orchestrator.chat.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.powerlifting.orchestrator.chat.model.ChatMessage;
import com.powerlifting.orchestrator.chat.model.ChatRole;
import com.powerlifting.orchestrator.chat.model.ChatStreamRequest;
import com.powerlifting.orchestrator.chat.model.RequestContext;
import com.powerlifting.orchestrator.chat.model.UserContext;
import com.powerlifting.orchestrator.observability.RequestMetrics;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Verifier issue strings become Prometheus label values in Phase 4, so both the
 * conditions and the exact strings are contract.
 */
class VerifierTest {

    private final Verifier verifier = new Verifier();

    private static RuntimeContext context() {
        ChatStreamRequest request = new ChatStreamRequest("u", "c",
                List.of(new ChatMessage(ChatRole.USER, "q")), null, 0,
                UserContext.DEFAULT, RequestContext.DEFAULT);
        return new ContextBuilder().build(request);
    }

    private static ExecutionPlan plan(boolean retrieve, boolean lifterData) {
        return new ExecutionPlan(retrieve, lifterData, false, "", ExecutionPlan.LLM);
    }

    @Test
    void aHealthyRequestHasNoIssues() {
        RequestMetrics metrics = new RequestMetrics("u", "c");

        assertThat(verifier.verify(context(), plan(true, false), "a real answer", 3, metrics))
                .isEmpty();
    }

    @Test
    void anEmptyAnswerIsFlagged() {
        RequestMetrics metrics = new RequestMetrics("u", "c");

        assertThat(verifier.verify(context(), plan(false, false), "   ", 0, metrics))
                .contains("empty_answer");
    }

    @Test
    void plannedRetrievalThatFoundNothingIsFlagged() {
        RequestMetrics metrics = new RequestMetrics("u", "c");

        assertThat(verifier.verify(context(), plan(true, false), "answer", 0, metrics))
                .contains("retrieval_planned_but_no_docs");
    }

    @Test
    void plannedLifterDataWithNoToolCallIsFlagged() {
        RequestMetrics metrics = new RequestMetrics("u", "c");

        assertThat(verifier.verify(context(), plan(false, true), "answer", 0, metrics))
                .contains("lifter_data_planned_but_no_tool_calls");
    }

    @Test
    void toolsThatAllFailedAreFlaggedEvenThoughToolsWereUsed() {
        // The dangerous case: tools_used looks healthy, but the answer is
        // running on no data because every call errored.
        RequestMetrics metrics = new RequestMetrics("u", "c");
        metrics.toolsUsed().add("get_lifter_history");
        metrics.toolErrors().add("get_lifter_history");

        assertThat(verifier.verify(context(), plan(false, true), "answer", 0, metrics))
                .contains("all_tool_calls_failed");
    }

    @Test
    void partialToolFailureIsNotFlagged() {
        RequestMetrics metrics = new RequestMetrics("u", "c");
        metrics.toolsUsed().add("get_lifter_history");
        metrics.toolsUsed().add("leaderboard_query");
        metrics.toolErrors().add("leaderboard_query");

        assertThat(verifier.verify(context(), plan(false, true), "answer", 0, metrics))
                .doesNotContain("all_tool_calls_failed");
    }
}
