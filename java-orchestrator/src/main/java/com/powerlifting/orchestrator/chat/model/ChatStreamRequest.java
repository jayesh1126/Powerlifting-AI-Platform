package com.powerlifting.orchestrator.chat.model;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/**
 * The request the gateway sends to start one chat turn.
 *
 * <p>The gateway sends a generous window of recent messages plus
 * the total count, and {@code ContextBuilder} decides how much to actually use.
 *
 * <p>Wire names are snake_case, applied globally by
 * {@code spring.jackson.property-naming-strategy}.
 */
public record ChatStreamRequest(

        String userId,
        String chatId,

        /** Recent window, oldest first. The final item is the new user message. */
        @NotEmpty List<ChatMessage> messages,

        /** Rolling summary the gateway persisted (already decrypted); null for young chats. */
        String summary,

        /**
         * Messages persisted before this turn — the conversation's length
         * without shipping all of it.
         *
         * <p>Boxed rather than {@code int} so an absent value is allowed: a
         * primitive would make Jackson reject the whole request when the field
         * is missing. The compact constructor then defaults it to 0, as with
         * every optional field here.
         */
        Integer totalMessageCount,

        UserContext userContext,
        RequestContext requestContext
) {

    public ChatStreamRequest {
        messages = messages != null ? List.copyOf(messages) : List.of();
        totalMessageCount = totalMessageCount != null ? totalMessageCount : 0;
        userContext = userContext != null ? userContext : UserContext.DEFAULT;
        requestContext = requestContext != null ? requestContext : RequestContext.DEFAULT;
    }

    /** The new user message this turn must answer. */
    public String query() {
        return messages.getLast().content();
    }
}
