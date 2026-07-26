package com.powerlifting.orchestrator.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.StringUtils;
import org.springframework.validation.annotation.Validated;

/**
 * Application configuration, bound from {@code powerlifting.*}.
 *
 * <p>Non-secret values live in {@code application.properties}; local secrets in
 * the gitignored {@code application-dev.properties}; deployments set
 * {@code SPRING_PROFILES_ACTIVE=prod} and supply secrets as environment
 * variables, which relaxed binding maps automatically
 * ({@code POWERLIFTING_INTERNAL_API_KEY} → {@code powerlifting.internal-api-key}).
 *
 * <p>Nested records group related settings so the property names read as a
 * hierarchy rather than a flat prefix soup, and {@code @DefaultValue} keeps
 * defaults next to the fields they belong to instead of scattered across
 * property files.
 */
@Validated
@ConfigurationProperties(prefix = "powerlifting")
public record OrchestratorProperties(

        /** Shared secret with the Next.js gateway. The one required value. */
        @NotBlank String internalApiKey,

        @DefaultValue Models models,
        @DefaultValue Supabase supabase,
        @DefaultValue Runtime runtime) {

    /** Which model plays which role — the quality-vs-cost dial. */
    public record Models(
            @DefaultValue("meta-llama/llama-3.1-8b-instruct") String planner,
            @DefaultValue("openai/gpt-4.1-mini") String generator,
            @DefaultValue("meta-llama/llama-3.1-8b-instruct") String summarizer,
            @DefaultValue("text-embedding-3-large") String embedding,
            @DefaultValue("openai/gpt-4.1-mini") String program,
            @DefaultValue("8000") int programMaxTokens) {
    }

    /** Knowledge base. The secret key is service_role: it bypasses RLS. */
    public record Supabase(String url, String secretKey) {

        public boolean isConfigured() {
            return StringUtils.hasText(url) && StringUtils.hasText(secretKey);
        }
    }

    public record Runtime(
            @DefaultValue("5") int maxToolRounds,
            @DefaultValue("20000") int maxToolResultChars) {
    }
}
