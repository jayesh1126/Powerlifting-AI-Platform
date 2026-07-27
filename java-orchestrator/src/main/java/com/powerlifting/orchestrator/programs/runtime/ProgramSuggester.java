package com.powerlifting.orchestrator.programs.runtime;

import com.powerlifting.orchestrator.chat.runtime.PromptTemplates;
import com.powerlifting.orchestrator.config.ChatModelConfig;
import com.powerlifting.orchestrator.config.OrchestratorProperties;
import com.powerlifting.orchestrator.observability.Instrumentation;
import com.powerlifting.orchestrator.observability.RequestMetrics;
import com.powerlifting.orchestrator.programs.model.ExercisePrescription;
import com.powerlifting.orchestrator.programs.model.Program;
import com.powerlifting.orchestrator.programs.model.ProgramDay;
import com.powerlifting.orchestrator.programs.model.ProgramSuggestRequest;
import com.powerlifting.orchestrator.programs.model.ProgramWeek;
import com.powerlifting.orchestrator.retrieval.CanonicalTopics;
import com.powerlifting.orchestrator.retrieval.KnowledgeRetrievalService;
import com.powerlifting.orchestrator.retrieval.RetrievedContext;
import com.powerlifting.orchestrator.retrieval.RetrievedDoc;
import com.powerlifting.orchestrator.stream.EventSink;
import com.powerlifting.orchestrator.stream.StreamEvent;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Reviews a program and streams discrete, individually-acceptable suggestions.
 *
 * <p>Owns the whole suggest turn (retrieve for grounding, prompt the model,
 * validate and emit each suggestion, report metrics), mirroring how
 * {@code ChatService} owns a chat turn. Never throws: a failure becomes an
 * {@code error} event, because by then the client may already have the
 * assessment and some cards.
 *
 * <p>The model is asked for JSONL — one JSON object per line — rather than a
 * single structured document, because suggestions must stream in one at a time.
 * That trades the strong guarantee of structured output for a prompt-only
 * contract, which is safe only because {@link SuggestLineParser} validates every
 * line against the program before it is emitted (see that class).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProgramSuggester {

    private static final int MAX_EXERCISE_NAMES = 12;
    private static final int MAX_CHARS_PER_EXCERPT = 1400;

    private static final String SYSTEM_PROMPT = """
            You are a powerlifting coach reviewing a lifter's OWN training program.

            REVIEW POSTURE (overrides anything below):
            - The program belongs to the user. Nothing about it is "invalid" — the
              programming principles attached below inform your suggestions; they are
              not validation rules and you never demand compliance with them.
            - Respect the user's evident structure and preferences. Propose the
              smallest changes with the largest impact — do not redesign their program
              into your house style.
            - Retrieved knowledge excerpts may be attached. Use them only when
              relevant; ignore them otherwise.
            - Never describe the principles as "mandatory" or "required", and never
              call the program non-compliant or invalid — they are guidance you weigh,
              not rules the user must satisfy.

            OUTPUT FORMAT — JSONL, strictly:
            - One JSON object per line. No markdown fences, no prose outside JSON.
            - First line: {"kind": "assessment", "text": "<2-3 sentence overall read of the program>"}
            - Then at most 10 suggestion lines, most impactful first:
              {"kind": "<suggestion kind>", "target_id": <string or null>, "payload": <object or null>, "rationale": "<one or two sentences>"}

            Suggestion kinds (your ENTIRE editing vocabulary):
            - "modify_exercise": target_id = an exercise id. payload = ONLY the fields to
              change (e.g. {"sets": 2, "rpe": 7.0}). Fields: name, sets, reps_min,
              reps_max, amrap, rpe, rpe_max, percentage, superset_group, notes.
            - "add_exercise":    target_id = the day id to add it to. payload = a full
              exercise object (same fields; name required).
            - "remove_exercise": target_id = the exercise id. payload = null.
            - "add_day":         target_id = the week id to add it to. payload = a full
              day object: {"label": ..., "exercises": [...], "notes": ...}.
            - "remove_day":      target_id = the day id. payload = null.
            - "program_note":    target_id = null. payload = null. Advice that is not
              expressible as a concrete edit; put it in "rationale".

            Rules:
            - target_id MUST be an id that appears in the program JSON you were given.
              Never invent ids. Never emit an "id" field in payloads.
            - Every suggestion needs a rationale a lifter can evaluate.
            - If a user instruction is present, ALL suggestions must serve that
              instruction — do not append unrelated general feedback.

            PROGRAMMING PRINCIPLES (guidance, not law):
            {templates}""";

    private final ChatClient chatClient;
    private final KnowledgeRetrievalService retrieval;
    private final PromptTemplates templates;
    private final OrchestratorProperties properties;
    private final Instrumentation instrumentation;
    private final ObjectMapper mapper;

    /** Streams the review into {@code sink}: assessment, suggestions, metrics, end. */
    public void stream(ProgramSuggestRequest request, EventSink sink) {
        RequestMetrics metrics = new RequestMetrics(request.userId(), "program:suggest");
        SuggestLineParser parser = new SuggestLineParser(request.program(), mapper);
        String outcome = Instrumentation.OUTCOME_OK;

        try {
            metrics.setGeneratorModel(properties.models().program());

            RetrievedContext retrieved = metrics.time("retrieval", () -> retrieval.retrieve(
                    deriveRetrievalQuery(request.program(), request.instruction()),
                    CanonicalTopics.DEFAULT_PROGRAM_TOPICS));
            metrics.setDocsRetrieved(retrieved.documents().size());

            metrics.timeVoid("suggest_llm",
                    () -> streamSuggestions(request, retrieved, parser, sink, metrics));

            sink.emit(new StreamEvent.Metrics(metrics.toMap()));
            sink.emit(new StreamEvent.End());
        } catch (UncheckedIOException e) {
            // Client hung up mid-stream; nothing left to write to. Not an error.
            log.info("client disconnected mid-stream user={}", request.userId());
        } catch (Exception e) {
            outcome = Instrumentation.OUTCOME_ERROR;
            log.error("program suggest failed user={}", request.userId(), e);
            sink.emit(new StreamEvent.Error("The AI runtime failed to produce suggestions."));
        } finally {
            int exercisesIn = request.program().weeks().stream()
                    .flatMap(week -> week.days().stream())
                    .mapToInt(day -> day.exercises().size())
                    .sum();
            // Suggest cost is input-dominated (the whole program + templates +
            // excerpts go in every call), so prompt_tokens is the number to watch.
            log.info("suggest done: model={} exercises_in={} prompt_tokens={} completion_tokens={} "
                            + "emitted={} dropped={} finish_reason={} drops={}",
                    properties.models().program(), exercisesIn,
                    metrics.promptTokens(), metrics.completionTokens(),
                    parser.emittedCount(), parser.droppedCount(),
                    metrics.generationFinishReason(), parser.drops());
            metrics.log();
            instrumentation.recordProgramRequest(metrics, Instrumentation.OP_SUGGEST, outcome);
            instrumentation.recordSuggestions(parser.emittedCount(), parser.droppedCount());
        }
    }

    /**
     * Consumes the model's JSONL stream, feeding each completed line to the
     * parser and emitting whatever validates. Newlines can split across network
     * chunks, so a partial line is buffered until its newline arrives.
     */
    private void streamSuggestions(ProgramSuggestRequest request, RetrievedContext retrieved,
                                   SuggestLineParser parser, EventSink sink, RequestMetrics metrics) {
        OpenAiChatOptions options = ChatModelConfig.optionsFor(properties.models().program())
                .temperature(0.2)
                .maxTokens(properties.models().programMaxTokens())
                .streamOptions(OpenAiChatOptions.StreamOptions.builder().includeUsage(true).build())
                .build();
        Prompt prompt = new Prompt(buildMessages(request, retrieved), options);

        StringBuilder buffer = new StringBuilder();
        StringBuilder full = new StringBuilder();
        TokenUsage usage = new TokenUsage();
        long llmStart = System.nanoTime();
        String[] finishReason = {null};   // holder: the forEach lambda can't reassign a local

        // See Generator: toStream() is the one sanctioned Flux bridge, safe here
        // because it blocks the request's virtual thread; try-with-resources
        // cancels the upstream call if the client disconnects.
        try (Stream<ChatResponse> responses = chatClient.prompt(prompt).stream().chatResponse().toStream()) {
            responses.forEach(response -> {
                String delta = textOf(response);
                if (delta != null && !delta.isEmpty()) {
                    metrics.markFirstToken(llmStart);   // time-to-first-token, set once
                    buffer.append(delta);
                    full.append(delta);
                    int newline;
                    while ((newline = buffer.indexOf("\n")) >= 0) {
                        String line = buffer.substring(0, newline);
                        buffer.delete(0, newline + 1);
                        emit(parser.feed(line), sink);
                    }
                }
                String reason = finishReasonOf(response);
                if (reason != null) {
                    finishReason[0] = reason;   // last non-null wins ("length" = truncated)
                }
                usage.observe(response);
            });
        }
        metrics.setGenerationFinishReason(finishReason[0]);

        // The final line usually arrives without a trailing newline.
        emit(parser.feed(buffer.toString()), sink);

        // Fallback: a model that emitted one JSON array instead of line-delimited
        // objects still yields suggestions rather than nothing.
        if (parser.assessment() == null && parser.suggestions().isEmpty()) {
            parser.feedArray(full.toString()).forEach(event -> emit(event, sink));
        }

        metrics.addUsage(usage.promptTokens, usage.completionTokens);

        if (parser.assessment() == null && parser.suggestions().isEmpty()) {
            throw new IllegalStateException("no parseable suggestions in model output");
        }
    }

    private static void emit(StreamEvent event, EventSink sink) {
        if (event != null) {
            sink.emit(event);
        }
    }

    private List<Message> buildMessages(ProgramSuggestRequest request, RetrievedContext retrieved) {
        // .replace, not .format: the prompt is full of literal JSON braces, which
        // String.format would try to read as format specifiers.
        String system = SYSTEM_PROMPT.replace("{templates}", templates.programTemplates());

        StringBuilder user = new StringBuilder("My program:\n")
                .append(mapper.writeValueAsString(request.program()));
        if (request.instruction() != null && !request.instruction().isBlank()) {
            user.append("\n\nMy instruction: ").append(request.instruction());
        }

        return List.of(
                new SystemMessage(system),
                new SystemMessage(excerpts(retrieved)),
                new UserMessage(user.toString()));
    }

    private static String excerpts(RetrievedContext retrieved) {
        List<RetrievedDoc> docs = retrieved != null ? retrieved.documents() : List.of();
        if (docs.isEmpty()) {
            return "Retrieved training excerpts: (none found)";
        }
        StringBuilder message = new StringBuilder("Retrieved training excerpts:\n\n");
        for (int i = 0; i < docs.size(); i++) {
            if (i > 0) {
                message.append("\n\n---\n\n");
            }
            String content = docs.get(i).content();
            message.append("Excerpt ").append(i + 1).append('\n')
                    .append(content.length() > MAX_CHARS_PER_EXCERPT
                            ? content.substring(0, MAX_CHARS_PER_EXCERPT) : content);
        }
        return message.toString();
    }

    /**
     * A retrieval query from the program's shape, not its full text: the
     * instruction (when present) leads so excerpts match the ask, and a compact
     * structural summary grounds it without shipping the whole program as a query.
     */
    private static String deriveRetrievalQuery(Program program, String instruction) {
        int weeks = program.weeks().size();
        int days = program.weeks().stream().mapToInt(w -> w.days().size()).max().orElse(0);

        Set<String> names = new LinkedHashSet<>();
        for (ProgramWeek week : program.weeks()) {
            for (ProgramDay day : week.days()) {
                for (ExercisePrescription exercise : day.exercises()) {
                    if (exercise.name() != null && !exercise.name().isBlank()) {
                        names.add(exercise.name().toLowerCase());
                    }
                }
            }
        }
        List<String> firstNames = names.stream().limit(MAX_EXERCISE_NAMES).toList();

        String summary = "powerlifting program review: " + weeks + " weeks, " + days
                + " days per week, exercises: " + String.join(", ", firstNames);
        return instruction != null && !instruction.isBlank()
                ? instruction + " — " + summary : summary;
    }

    private static String textOf(ChatResponse response) {
        if (response == null || response.getResult() == null) {
            return null;
        }
        AssistantMessage output = response.getResult().getOutput();
        return output != null ? output.getText() : null;
    }

    private static String finishReasonOf(ChatResponse response) {
        if (response == null || response.getResult() == null
                || response.getResult().getMetadata() == null) {
            return null;
        }
        return response.getResult().getMetadata().getFinishReason();
    }

    /** Latest usage seen on the stream; the provider reports it cumulatively. */
    private static final class TokenUsage {
        private int promptTokens;
        private int completionTokens;

        void observe(ChatResponse response) {
            if (response == null || response.getMetadata() == null) {
                return;
            }
            Usage reported = response.getMetadata().getUsage();
            if (reported == null) {
                return;
            }
            Integer prompt = reported.getPromptTokens();
            Integer completion = reported.getCompletionTokens();
            if (prompt != null && prompt > 0) {
                this.promptTokens = prompt;
            }
            if (completion != null && completion > 0) {
                this.completionTokens = completion;
            }
        }
    }
}
