package com.powerlifting.orchestrator.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Binds the gateway's {@code X-Request-Id} to the logging context for the
 * lifetime of the request, so concurrent chats stay separable and a gateway
 * log line can be matched to its orchestrator lines.
 *
 * <p>The id is held in SLF4J's MDC, a ThreadLocal, which suits the one-virtual-
 * thread-per-request model: no thread pooling means no risk of an id leaking
 * between requests.
 *
 * <p>Important caveat: MDC does <em>not</em> follow work onto the separate async
 * dispatch thread that writes a streamed response body, so a streaming handler
 * must re-bind it there. {@link #currentRequestId()} exists for that hand-off.
 *
 * <p>Ordered first so that even a rejected request (401 from
 * {@link InternalApiKeyFilter}) is logged with its id.
 */
@Component
@Order(RequestIdFilter.ORDER)
public class RequestIdFilter extends OncePerRequestFilter {

    static final int ORDER = 0;

    public static final String HEADER = "X-Request-Id";
    public static final String MDC_KEY = "requestId";
    public static final String ABSENT = "-";

    private static final int MAX_LENGTH = 64;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        MDC.put(MDC_KEY, sanitize(request.getHeader(HEADER)));
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }

    /** The current request's id, for re-binding on an async/streaming thread. */
    public static String currentRequestId() {
        String id = MDC.get(MDC_KEY);
        return id != null ? id : ABSENT;
    }

    /**
     * Header values are attacker-influenced in principle, and they land in
     * every log line: bound the length and strip anything that could forge a
     * log record.
     */
    private static String sanitize(String raw) {
        if (raw == null || raw.isBlank()) {
            return ABSENT;                       // e.g. /health probes
        }
        String trimmed = raw.length() > MAX_LENGTH ? raw.substring(0, MAX_LENGTH) : raw;
        return trimmed.replaceAll("[\\p{Cntrl}]", "");
    }
}
