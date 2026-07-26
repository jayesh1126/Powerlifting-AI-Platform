package com.powerlifting.orchestrator.chat.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.powerlifting.orchestrator.chat.model.ChatMessage;
import com.powerlifting.orchestrator.chat.model.ChatRole;
import com.powerlifting.orchestrator.chat.model.ChatStreamRequest;
import com.powerlifting.orchestrator.chat.model.RequestContext;
import com.powerlifting.orchestrator.chat.model.Subscription;
import com.powerlifting.orchestrator.chat.model.UserContext;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The context policy decides how much conversation each tier pays for, so its
 * edges are worth pinning: they are a cost lever, and a silent change here
 * would show up as a bill rather than a failure.
 */
class ContextBuilderTest {

    private final ContextBuilder builder = new ContextBuilder();

    private static ChatStreamRequest request(int historySize, int totalMessageCount,
                                             Subscription subscription) {
        List<ChatMessage> messages = new ArrayList<>();
        for (int i = 0; i < historySize; i++) {
            messages.add(new ChatMessage(
                    i % 2 == 0 ? ChatRole.USER : ChatRole.ASSISTANT, "old " + i));
        }
        messages.add(new ChatMessage(ChatRole.USER, "the new question"));
        return new ChatStreamRequest("u", "c", messages, "prior summary", totalMessageCount,
                new UserContext(subscription), RequestContext.DEFAULT);
    }

    @Test
    void theNewUserMessageIsTheQueryAndIsExcludedFromHistory() {
        RuntimeContext ctx = builder.build(request(3, 0, Subscription.FREE));

        assertThat(ctx.query()).isEqualTo("the new question");
        assertThat(ctx.history()).hasSize(3);
        assertThat(ctx.history()).noneMatch(m -> m.content().equals("the new question"));
    }

    @Test
    void freeTierKeepsOnlyTheMostRecentSixMessages() {
        RuntimeContext ctx = builder.build(request(30, 0, Subscription.FREE));

        assertThat(ctx.history()).hasSize(6);
        // Trimmed from the front: the most recent survive.
        assertThat(ctx.history().getLast().content()).isEqualTo("old 29");
    }

    @Test
    void proTierKeepsTwentyMessages() {
        RuntimeContext ctx = builder.build(request(30, 0, Subscription.PRO));

        assertThat(ctx.history()).hasSize(20);
    }

    @Test
    void shortHistoryIsNotPadded() {
        RuntimeContext ctx = builder.build(request(2, 0, Subscription.PRO));

        assertThat(ctx.history()).hasSize(2);
    }

    @Test
    void summaryRefreshesOnTheFirstExchangeThenEveryFifth() {
        // count_after_turn == 2 -> the very first exchange.
        assertThat(builder.build(request(0, 0, Subscription.FREE)).shouldUpdateSummary()).isTrue();
        // 6 + 2 = 8 -> not a multiple of 10.
        assertThat(builder.build(request(1, 6, Subscription.FREE)).shouldUpdateSummary()).isFalse();
        // 8 + 2 = 10 -> refresh.
        assertThat(builder.build(request(1, 8, Subscription.FREE)).shouldUpdateSummary()).isTrue();
        // 18 + 2 = 20 -> refresh.
        assertThat(builder.build(request(1, 18, Subscription.FREE)).shouldUpdateSummary()).isTrue();
    }
}
