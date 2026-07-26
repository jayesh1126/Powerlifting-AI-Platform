package com.powerlifting.orchestrator.chat;

import com.powerlifting.orchestrator.chat.model.ChatStreamRequest;
import com.powerlifting.orchestrator.filter.RequestIdFilter;
import com.powerlifting.orchestrator.stream.NdjsonSink;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.io.UncheckedIOException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import tools.jackson.databind.ObjectMapper;

/**
 * The only AI endpoint. Streams NDJSON events (see
 * {@link com.powerlifting.orchestrator.stream.StreamEvent}): {@code token}
 * lines while generating, then {@code citations} / {@code summary} /
 * {@code metrics} / {@code end}.
 *
 * <p>The gateway has already authenticated the user and verified chat ownership
 * and quota; it forwards token text to the browser and persists everything else.
 *
 * <p>Deliberately thin: validation, the response envelope, and carrying the
 * request id onto the async thread. Producing the answer is
 * {@link ChatService}'s job.
 */
@Slf4j
@RestController
@RequestMapping("/v1/chat")
@RequiredArgsConstructor
@Tag(name = "Chat", description = "The streaming AI coaching endpoint")
@SecurityRequirement(name = "internal-api-key")
public class ChatController {

    private final ChatService chatService;
    private final ObjectMapper objectMapper;

    @Operation(
            summary = "Stream one chat turn",
            description = """
                    Runs the full pipeline (plan → retrieve → generate with tools →
                    verify → summarise) and streams the result as NDJSON: `token` lines
                    first, then `citations`, an optional `summary`, `metrics` and `end`.
                    Swagger UI's "Try it out" shows the raw stream but does not render it
                    incrementally — use curl -N to see live tokens.""")
    @PostMapping(value = "/stream", produces = "application/x-ndjson")
    public StreamingResponseBody stream(@Valid @RequestBody ChatStreamRequest request) {
        log.info("chat/stream user={} chat={} messages={} total={} sub={}",
                request.userId(), request.chatId(), request.messages().size(),
                request.totalMessageCount(), request.userContext().subscription());

        // The lambda below runs on a separate async dispatch thread where MDC is empty, so the id has to
        // be carried across explicitly or every streamed log line loses correlation.
        String requestId = RequestIdFilter.currentRequestId();

        return outputStream -> {
            MDC.put(RequestIdFilter.MDC_KEY, requestId);
            try {
                chatService.streamTurn(request, new NdjsonSink(outputStream, objectMapper));
            } catch (UncheckedIOException e) {
                // The browser navigated away or the gateway timed out. Normal,
                // not an error — there is nothing left to write to.
                log.info("client disconnected mid-stream chat={}", request.chatId());
            } finally {
                MDC.remove(RequestIdFilter.MDC_KEY);
            }
        };
    }
}
