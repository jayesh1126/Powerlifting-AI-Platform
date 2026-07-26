package com.powerlifting.orchestrator.chat.model;

import com.fasterxml.jackson.annotation.JsonProperty;

/** The caller's plan tier, which drives the context policy (see ContextPolicy). */
public enum Subscription {

    @JsonProperty("free")
    FREE,

    @JsonProperty("pro")
    PRO
}
