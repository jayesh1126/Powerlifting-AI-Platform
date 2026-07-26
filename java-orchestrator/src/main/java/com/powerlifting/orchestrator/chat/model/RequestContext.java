package com.powerlifting.orchestrator.chat.model;

/**
 * Per-request locale hints from the gateway. Accepted as part of the wire
 * contract and defaulted when absent; not yet consumed by the runtime, but
 * available for future locale- or timezone-aware behaviour.
 */
public record RequestContext(String timezone, String locale) {

    public static final RequestContext DEFAULT = new RequestContext("UTC", "en");

    public RequestContext {
        timezone = timezone != null ? timezone : "UTC";
        locale = locale != null ? locale : "en";
    }
}
