package com.powerlifting.orchestrator.programs;

import com.powerlifting.orchestrator.observability.Instrumentation;
import com.powerlifting.orchestrator.observability.RequestMetrics;
import com.powerlifting.orchestrator.programs.model.ProgramNormalizeRequest;
import com.powerlifting.orchestrator.programs.model.ProgramNormalizeResponse;
import com.powerlifting.orchestrator.programs.model.ProgramSuggestRequest;
import com.powerlifting.orchestrator.programs.runtime.ProgramNormalizer;
import com.powerlifting.orchestrator.programs.runtime.ProgramSuggester;
import com.powerlifting.orchestrator.stream.NdjsonSink;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

/**
 * The program endpoints. The gateway has already authenticated the user and
 * checked the AI-actions quota; this service owns the AI.
 *
 * <p>Error bodies are {@code {"detail": "..."}} to match what the gateway reads
 * off a non-2xx response. Statuses are chosen so the gateway can act on them:
 * a 422 means the program was too large (a size problem the user can fix by
 * splitting it), a 502 means the model genuinely failed.
 */
@Slf4j
@RestController
@RequestMapping("/v1/programs")
@RequiredArgsConstructor
@Tag(name = "Programs", description = "Program normalization and AI suggestions")
@SecurityRequirement(name = "internal-api-key")
public class ProgramController {

    // Defensive backstop against a pathological payload driving unbounded LLM
    // cost/latency on suggest (which feeds a whole program into the prompt).
    // These sit ABOVE the gateway's product caps (12 weeks / 7 days) — they trip
    // only on clearly-abusive input, never a legitimate large program. Normalize
    // needs no such guard: its input is capped at 20k chars and its output at
    // programMaxTokens, so the program it produces is already bounded.
    private static final int MAX_WEEKS = 20;
    private static final int MAX_EXERCISES = 1500;

    private final ProgramNormalizer normalizer;
    private final ProgramSuggester suggester;
    private final Instrumentation instrumentation;
    private final ObjectMapper objectMapper;

    @Operation(
            summary = "Normalize pasted program text",
            description = """
                    Converts free-form program text into canonical Program JSON with
                    stable node ids. Returns {is_program, reason, program}: a rejection
                    (is_program=false) when the text is not a training program, 422 when
                    the program is too large to import in one piece, 502 when the model
                    could not produce valid output.""")
    @PostMapping("/normalize")
    public ResponseEntity<Object> normalize(@Valid @RequestBody ProgramNormalizeRequest request) {
        log.info("programs/normalize user={} chars={}",
                request.userId(), request.programText().length());

        RequestMetrics metrics = new RequestMetrics(request.userId(), "program:normalize");
        String outcome = Instrumentation.OUTCOME_OK;
        try {
            ProgramNormalizeResponse response =
                    metrics.time("normalize", () -> normalizer.normalize(request.programText(), metrics));
            if (!response.isProgram()) {
                outcome = Instrumentation.OUTCOME_REJECTED;
            }
            return ResponseEntity.ok(response);
        } catch (ProgramNormalizer.TruncatedException e) {
            outcome = Instrumentation.OUTCOME_ERROR;
            log.warn("programs/normalize output truncated (program too large)");
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_CONTENT).body(Map.of(
                    "detail",
                    "This program is too large to import in one piece — try splitting it into blocks."));
        } catch (ProgramNormalizer.NormalizationException e) {
            outcome = Instrumentation.OUTCOME_ERROR;
            log.error("programs/normalize failed validation after repair", e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("detail", "Program normalization failed"));
        } finally {
            metrics.log();
            instrumentation.recordProgramRequest(metrics, Instrumentation.OP_NORMALIZE, outcome);
        }
    }

    @Operation(
            summary = "Stream AI suggestions for a program",
            description = """
                    Reviews a program (with an optional targeted instruction) and streams
                    NDJSON: one `assessment` event, then validated `suggestion` events (each
                    checked against the program's node ids before emit), then `metrics` and
                    `end`. Use curl -N to see suggestions arrive one at a time.""")
    @PostMapping(value = "/suggest", produces = "application/x-ndjson")
    public void suggest(@Valid @RequestBody ProgramSuggestRequest request,
                        HttpServletResponse response) throws IOException {
        int weeks = request.program().weeks().size();
        int exercises = request.program().weeks().stream()
                .flatMap(week -> week.days().stream())
                .mapToInt(day -> day.exercises().size())
                .sum();

        // The instruction is user content — log its presence, never its text.
        log.info("programs/suggest user={} weeks={} exercises={} instruction={}",
                request.userId(), weeks, exercises, request.instruction() != null);

        if (weeks > MAX_WEEKS || exercises > MAX_EXERCISES) {
            log.warn("programs/suggest rejected oversized program: weeks={} exercises={}",
                    weeks, exercises);
            response.setStatus(HttpStatus.UNPROCESSABLE_CONTENT.value());
            response.setContentType("application/json");
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"detail\":\"This program is too large to analyze.\"}");
            return;
        }

        response.setContentType("application/x-ndjson");
        response.setCharacterEncoding("UTF-8");

        // Raw response stream, not StreamingResponseBody: the latter's
        // NonFlushingOutputStream swallows per-event flushes, so suggestions
        // would arrive in one lump at the end instead of one at a time.
        try {
            suggester.stream(request, new NdjsonSink(response.getOutputStream(), objectMapper));
        } catch (UncheckedIOException e) {
            log.info("client disconnected mid-stream user={}", request.userId());
        }
    }
}
