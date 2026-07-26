package com.powerlifting.orchestrator.filter;

import com.powerlifting.orchestrator.config.OrchestratorProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates the caller by a shared secret header ({@code X-Internal-Api-Key})
 * on every {@code /v1/**} request. End-user authentication (Supabase JWTs) is the
 * gateway's job; this service only ever talks to that one trusted caller.
 *
 * <p>A plain servlet filter rather than Spring Security by choice: the entire
 * policy is "one header equals one secret", and the security starter would add a
 * filter chain, a default login page and CSRF handling to configure around for
 * no benefit. Revisit if this service ever needs real, role-based authorization.
 *
 * <p>The comparison uses {@link MessageDigest#isEqual} for constant time: a
 * plain {@code equals} short-circuits on the first differing byte, which leaks
 * how much of a guessed key is correct through response timing.
 */
@Component
@Order(InternalApiKeyFilter.ORDER)
@Slf4j
public class InternalApiKeyFilter extends OncePerRequestFilter {

    static final int ORDER = RequestIdFilter.ORDER + 1;

    public static final String HEADER = "X-Internal-Api-Key";

    private final byte[] expectedKey;

    public InternalApiKeyFilter(OrchestratorProperties properties) {
        this.expectedKey = properties.internalApiKey().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String provided = request.getHeader(HEADER);
        if (provided == null
                || !MessageDigest.isEqual(provided.getBytes(StandardCharsets.UTF_8), expectedKey)) {
            log.warn("rejected unauthenticated request to {}", request.getRequestURI());
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"detail\":\"Invalid internal API key\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    /**
     * Only {@code /v1/**} carries the API-key gate. Everything else is
     * infrastructure that must stay open on the internal network:
     * <ul>
     *   <li>{@code /actuator/**} — the container healthcheck and Prometheus
     *       scrape, both unauthenticated;
     *   <li>{@code /swagger-ui/**}, {@code /v3/api-docs/**} — the API docs,
     *       which a browser cannot send the key to. Safe because the whole
     *       service is unpublished (only Caddy exposes ports); if that ever
     *       changes, disable springdoc in prod via {@code springdoc.*.enabled}.
     * </ul>
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/actuator")
                || path.startsWith("/swagger-ui")
                || path.startsWith("/v3/api-docs");
    }
}
