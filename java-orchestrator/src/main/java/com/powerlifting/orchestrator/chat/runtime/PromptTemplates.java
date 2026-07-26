package com.powerlifting.orchestrator.chat.runtime;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Loads and caches the program-design rules injected into the generator's
 * system prompt when a turn involves programming.
 *
 * <p>The markdown ships as a classpath resource
 * ({@code resources/content/program_templates.md}) so the container image is
 * self-contained and the build depends on nothing outside this module. It is
 * read once at construction; a missing file degrades to a placeholder rather
 * than failing startup, since a program answer without the rules is still
 * useful.
 */
@Component
@Slf4j
public class PromptTemplates {

    private static final String PATH = "content/program_templates.md";

    private final String programTemplates;

    public PromptTemplates() {
        this.programTemplates = load();
    }

    public String programTemplates() {
        return programTemplates;
    }

    private static String load() {
        try {
            var resource = new ClassPathResource(PATH);
            String content = resource.getContentAsString(StandardCharsets.UTF_8);
            log.info("loaded program templates ({} chars)", content.length());
            return content;
        } catch (IOException | UncheckedIOException e) {
            log.warn("program templates missing at classpath:{}", PATH);
            return "(no templates available)";
        }
    }
}
