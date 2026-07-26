package com.powerlifting.orchestrator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * The AI runtime. Called only by the Next.js gateway with a shared internal
 * API key — never exposed to browsers directly.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class OrchestratorApplication {

    public static void main(String[] args) {
        SpringApplication.run(OrchestratorApplication.class, args);
    }
}
