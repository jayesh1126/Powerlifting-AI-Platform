package com.powerlifting.orchestrator.chat.model;

/** One turn of the conversation: who said it and the (already decrypted) text. */
public record ChatMessage(ChatRole role, String content) {
}
