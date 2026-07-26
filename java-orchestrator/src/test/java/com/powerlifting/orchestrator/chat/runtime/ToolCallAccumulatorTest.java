package com.powerlifting.orchestrator.chat.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.AssistantMessage.ToolCall;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;

/**
 * Streamed tool calls arrive in pieces, and client libraries differ on whether
 * they pre-merge those pieces. Getting this wrong is silent: arguments come out
 * duplicated ({@code {"name":"X"}{"name":"X"}}) or truncated, and the model is
 * simply told its own call was malformed.
 */
class ToolCallAccumulatorTest {

    private static ChatResponse responseWith(ToolCall... calls) {
        return new ChatResponse(List.of(new Generation(
                AssistantMessage.builder().content("").toolCalls(List.of(calls)).build())));
    }

    @Test
    void rawFragmentsAreAppended() {
        // Provider streams argument deltas: id and name first, then JSON pieces.
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        accumulator.observe(responseWith(new ToolCall("c1", "function", "get_lifter_history", "")));
        accumulator.observe(responseWith(new ToolCall("", "", "", "{\"name\":")));
        accumulator.observe(responseWith(new ToolCall("", "", "", "\"Russel")));
        accumulator.observe(responseWith(new ToolCall("", "", "", " Orhii\"}")));

        assertThat(accumulator.toToolCalls()).singleElement().satisfies(call -> {
            assertThat(call.name()).isEqualTo("get_lifter_history");
            assertThat(call.arguments()).isEqualTo("{\"name\":\"Russel Orhii\"}");
        });
    }

    @Test
    void cumulativeArgumentsAreReplacedNotConcatenated() {
        // Provider (or client) pre-merges: each chunk already contains
        // everything so far. Appending here would duplicate the JSON.
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        accumulator.observe(responseWith(new ToolCall("c1", "function", "get_lifter_history", "{\"name\":")));
        accumulator.observe(responseWith(new ToolCall("c1", "function", "get_lifter_history", "{\"name\":\"Russel")));
        accumulator.observe(responseWith(new ToolCall("c1", "function", "get_lifter_history", "{\"name\":\"Russel Orhii\"}")));

        assertThat(accumulator.toToolCalls()).singleElement().satisfies(call ->
                assertThat(call.arguments()).isEqualTo("{\"name\":\"Russel Orhii\"}"));
    }

    @Test
    void parallelToolCallsAreKeptSeparateAndOrdered() {
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        accumulator.observe(responseWith(
                new ToolCall("a", "function", "get_lifter_history", "{\"name\":\"A\"}"),
                new ToolCall("b", "function", "leaderboard_query", "{\"topN\":5}")));

        assertThat(accumulator.toToolCalls())
                .extracting(ToolCall::name)
                .containsExactly("get_lifter_history", "leaderboard_query");
    }

    @Test
    void aResponseWithNoToolCallsLeavesItEmpty() {
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        accumulator.observe(new ChatResponse(List.of(
                new Generation(new AssistantMessage("just text")))));

        assertThat(accumulator.isEmpty()).isTrue();
    }

    @Test
    void nullsAndEmptyResponsesAreTolerated() {
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        accumulator.observe(null);

        assertThat(accumulator.isEmpty()).isTrue();
    }
}
