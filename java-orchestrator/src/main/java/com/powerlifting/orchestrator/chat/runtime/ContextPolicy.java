package com.powerlifting.orchestrator.chat.runtime;

import com.powerlifting.orchestrator.chat.model.Subscription;
import java.util.Map;

/**
 * How much conversation each subscription tier actually gets to use.
 *
 * <p>Context management is an AI concern, so the policy lives here and not in
 * the gateway: the gateway ships a generous window plus the total count, and
 * this decides what to spend. One place to tune quality vs. cost — never touch
 * the frontend for it.
 */
public record ContextPolicy(int recentMessages, boolean useSummary) {

    public static final Map<Subscription, ContextPolicy> BY_SUBSCRIPTION = Map.of(
            Subscription.FREE, new ContextPolicy(6, true),
            Subscription.PRO, new ContextPolicy(20, true));

    /**
     * Refresh the rolling summary every N persisted messages. 10 messages is one
     * message every 5 user/assistant exchanges (each exchange is two messages);
     * {@link ContextBuilder} also forces a refresh on the very first exchange.
     */
    public static final int SUMMARY_REFRESH_EVERY = 10;

    public static ContextPolicy forSubscription(Subscription subscription) {
        return BY_SUBSCRIPTION.getOrDefault(subscription, BY_SUBSCRIPTION.get(Subscription.FREE));
    }
}
