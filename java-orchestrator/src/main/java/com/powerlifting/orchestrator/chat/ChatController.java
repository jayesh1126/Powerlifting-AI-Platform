package com.powerlifting.orchestrator.chat;

import com.powerlifting.orchestrator.chat.model.ChatStreamRequest;
import com.powerlifting.orchestrator.stream.NdjsonSink;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.io.UncheckedIOException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
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
 * <p><b>Why write to the raw response, not {@code StreamingResponseBody}:</b>
 * Spring MVC hands a {@code StreamingResponseBody} a
 * {@code StreamUtils.NonFlushingOutputStream} — its {@code flush()} is a no-op,
 * so tokens accumulate and the whole answer arrives in one lump at the end,
 * defeating streaming entirely. Writing to {@link HttpServletResponse}'s own
 * output stream means {@link NdjsonSink}'s per-event flush reaches the socket,
 * so tokens stream live. This runs on the request's virtual thread and blocks it
 * for the turn, which the virtual-thread model makes cheap — and it keeps the
 * SLF4J MDC request id bound throughout (no async thread hand-off needed).
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
    public void stream(@Valid @RequestBody ChatStreamRequest request,
                       HttpServletResponse response) throws IOException {
        log.info("chat/stream user={} chat={} messages={} total={} sub={}",
                request.userId(), request.chatId(), request.messages().size(),
                request.totalMessageCount(), request.userContext().subscription());

        response.setContentType("application/x-ndjson");
        response.setCharacterEncoding("UTF-8");

        try {
            chatService.streamTurn(request, new NdjsonSink(response.getOutputStream(), objectMapper));
        } catch (UncheckedIOException e) {
            // The browser navigated away or the gateway timed out. Normal, not
            // an error — there is nothing left to write to.
            log.info("client disconnected mid-stream chat={}", request.chatId());
        }
    }
}
