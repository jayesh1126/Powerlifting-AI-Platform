package com.powerlifting.orchestrator.config;

import io.swagger.v3.oas.annotations.enums.SecuritySchemeIn;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI / Swagger UI metadata.
 *
 * <p>The {@code @SecurityScheme} declares the shared-secret header so Swagger
 * UI's "Authorize" dialog can attach it — every {@code /v1} call needs it. The
 * scheme is referenced from the controller with
 * {@code @SecurityRequirement(name = "internal-api-key")}.
 */
@Configuration
@SecurityScheme(
        name = "internal-api-key",
        type = SecuritySchemeType.APIKEY,
        in = SecuritySchemeIn.HEADER,
        paramName = "X-Internal-Api-Key",
        description = "Shared secret between the Next.js gateway and this service.")
public class OpenApiConfig {

    @Bean
    public OpenAPI orchestratorOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Powerlifting AI — Orchestrator")
                .version("0.1.0")
                .description("""
                        The trusted internal AI runtime: planning, retrieval, tool-calling \
                        and generation for the powerlifting coach. Called only by the \
                        Next.js gateway with a shared internal API key — never exposed to \
                        browsers directly.

                        The chat endpoint returns an NDJSON event stream (one JSON object \
                        per line): `token` lines while generating, then `citations`, an \
                        optional `summary`, `metrics` and `end`."""));
    }
}
