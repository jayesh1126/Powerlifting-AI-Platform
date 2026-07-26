package com.powerlifting.orchestrator.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Exposes the single {@link ChatClient}, built from Spring AI's autoconfigured
 * builder.
 *
 * <p>Credentials and base URL come from {@code spring.ai.openai.*}; only the
 * model id and sampling settings vary per stage, which
 * {@link #optionsFor(String)} supplies as per-request options merged over the
 * client's defaults. One client, several roles — a bean per role would only
 * duplicate the same connection settings.
 */
@Configuration
public class ChatModelConfig {

    @Bean
    public ChatClient chatClient(ChatClient.Builder builder) {
        return builder.build();
    }

    /**
     * Starts a per-call options builder pinned to {@code model}. Each runtime
     * stage adds its own temperature / token limits before the call; only the
     * model id and sampling differ between stages, so nothing else is set here.
     */
    public static OpenAiChatOptions.Builder optionsFor(String model) {
        return OpenAiChatOptions.builder().model(model);
    }
}
