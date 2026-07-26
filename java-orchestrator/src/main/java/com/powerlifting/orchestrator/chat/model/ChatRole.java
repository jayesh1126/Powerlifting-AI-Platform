package com.powerlifting.orchestrator.chat.model;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * The author of a message. Wire values are capitalised ("User" / "Assistant");
 * the Java constants follow Java naming and the annotations pin the wire form.
 */
public enum ChatRole {

    @JsonProperty("User")
    USER("User"),

    @JsonProperty("Assistant")
    ASSISTANT("Assistant");

    private final String wireName;

    ChatRole(String wireName) {
        this.wireName = wireName;
    }

    /**
     * The capitalised form, for use anywhere the role is written into a prompt.
     * {@code toString()} would yield "USER" and silently change the text the
     * model sees; prompt text is behaviour, so it gets a named accessor.
     */
    public String wireName() {
        return wireName;
    }
}
