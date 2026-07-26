package com.powerlifting.orchestrator.chat.model;

/**
 * Per-user context. Records have no field defaults, so a compact constructor
 * normalises a null subscription to FREE — the pattern every optional record in
 * this package uses.
 */
public record UserContext(Subscription subscription) {

    public static final UserContext DEFAULT = new UserContext(Subscription.FREE);

    public UserContext {
        subscription = subscription != null ? subscription : Subscription.FREE;
    }
}
