package com.powerlifting.orchestrator.chat.runtime;

import com.powerlifting.orchestrator.chat.model.ChatMessage;
import com.powerlifting.orchestrator.chat.model.ChatRole;
import com.powerlifting.orchestrator.config.ChatModelConfig;
import com.powerlifting.orchestrator.config.OrchestratorProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Component;

/**
 * Rolling conversation summary.
 *
 * <p>Summaries are AI, so they live here — the gateway only stores what comes
 * back in the {@code summary} stream event. The cadence (which turns refresh
 * it) is decided by {@link ContextBuilder}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class Summarizer {

    private static final String SYSTEM_PROMPT = """
            You are a summarizer for a powerlifting assistant chat.
            Your task: maintain a running summary of the conversation.
            - If an existing summary is provided, update/expand it with the new messages.
            - If no summary exists, create a new one.
            - Keep it concise, ~2-3 sentences max.
            - Preserve important topics (bench, squat, deadlift, program design, nutrition, etc).
            - Output ONLY the summary text: no preamble, no labels, no headings.""";

    private final ChatClient chatClient;
    private final OrchestratorProperties properties;

    /**
     * @return the refreshed summary, or null if it could not be produced — the
     *         gateway then keeps the old one.
     */
    public String summarize(RuntimeContext ctx, String answer) {
        List<ChatMessage> messages = new ArrayList<>(ctx.history());
        messages.add(new ChatMessage(ChatRole.USER, ctx.query()));
        messages.add(new ChatMessage(ChatRole.ASSISTANT, answer));

        String userContent = "Existing summary:\n"
                + (ctx.hasSummary() ? ctx.summary() : "(none)")
                + "\n\nLast messages:\n"
                + messages.stream()
                          .map(m -> m.role().wireName() + ": " + m.content())
                          .collect(Collectors.joining("\n"));

        try {
            String summary = chatClient.prompt()
                    .options(ChatModelConfig.optionsFor(properties.models().summarizer())
                            .temperature(0.3)
                            .maxTokens(400))
                    .system(SYSTEM_PROMPT)
                    .user(userContent)
                    .call()
                    .content();

            if (summary == null || summary.isBlank()) {
                return null;
            }
            log.info("summary refreshed ({} chars)", summary.strip().length());
            return summary.strip();
        } catch (Exception e) {
            log.warn("summary generation failed: {}", e.toString());
            return null;
        }
    }
}
