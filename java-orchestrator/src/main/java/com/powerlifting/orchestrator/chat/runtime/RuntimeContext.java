package com.powerlifting.orchestrator.chat.runtime;

import com.powerlifting.orchestrator.chat.model.ChatMessage;
import com.powerlifting.orchestrator.chat.model.ChatStreamRequest;
import java.util.List;

/**
 * The immutable snapshot of what a turn knows before any model call: the query,
 * the trimmed history, the applicable policy, the stored summary, and whether
 * this turn should refresh it. It holds information only — nothing about prompts.
 *
 * <p>Immutable by design: later stages (retrieval, generation) take it as input
 * and produce their own outputs rather than mutating it, which keeps the flow in
 * {@code ChatService} easy to follow and free of order-of-mutation surprises.
 *
 * @param history trimmed to the policy window, excluding the new user message
 */
public record RuntimeContext(
        ChatStreamRequest request,
        ContextPolicy policy,
        String query,
        List<ChatMessage> history,
        String summary,
        boolean shouldUpdateSummary) {

    public RuntimeContext {
        history = List.copyOf(history);
    }

    public boolean hasSummary() {
        return summary != null && !summary.isBlank();
    }
}
