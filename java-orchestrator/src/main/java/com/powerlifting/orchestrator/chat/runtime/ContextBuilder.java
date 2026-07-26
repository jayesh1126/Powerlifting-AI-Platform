package com.powerlifting.orchestrator.chat.runtime;

import com.powerlifting.orchestrator.chat.model.ChatMessage;
import com.powerlifting.orchestrator.chat.model.ChatStreamRequest;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Assembles the {@link RuntimeContext} for a turn: which prior messages to keep,
 * whether to use the stored summary, and whether this turn should refresh it.
 *
 * <p>Context sizing is a subscription-tier decision (see {@link ContextPolicy}),
 * so it lives here rather than in the gateway — the gateway sends a generous
 * window and this trims it to what the tier pays for.
 */
@Component
public class ContextBuilder {

    public RuntimeContext build(ChatStreamRequest request) {
        ContextPolicy policy = ContextPolicy.forSubscription(request.userContext().subscription());

        // Everything except the new user message, then trimmed to the window.
        List<ChatMessage> history = request.messages().subList(0, request.messages().size() - 1);
        if (policy.recentMessages() > 0 && history.size() > policy.recentMessages()) {
            history = history.subList(history.size() - policy.recentMessages(), history.size());
        }

        // Counted as it will be once this turn persists (user + assistant).
        int countAfterTurn = request.totalMessageCount() + 2;
        boolean shouldUpdateSummary =
                countAfterTurn == 2 || countAfterTurn % ContextPolicy.SUMMARY_REFRESH_EVERY == 0;

        return new RuntimeContext(
                request,
                policy,
                request.query(),
                history,
                policy.useSummary() ? request.summary() : null,
                shouldUpdateSummary);
    }
}
