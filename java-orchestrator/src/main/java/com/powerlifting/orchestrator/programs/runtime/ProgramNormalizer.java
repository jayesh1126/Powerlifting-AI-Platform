package com.powerlifting.orchestrator.programs.runtime;

import com.powerlifting.orchestrator.config.ChatModelConfig;
import com.powerlifting.orchestrator.config.OrchestratorProperties;
import com.powerlifting.orchestrator.observability.RequestMetrics;
import com.powerlifting.orchestrator.programs.model.ExercisePrescription;
import com.powerlifting.orchestrator.programs.model.Program;
import com.powerlifting.orchestrator.programs.model.ProgramDay;
import com.powerlifting.orchestrator.programs.model.ProgramNormalizeResponse;
import com.powerlifting.orchestrator.programs.model.ProgramWeek;
import java.util.ArrayList;
import java.util.List;
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
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Turns pasted program text into a canonical {@link Program}, or rejects it.
 *
 * <p>The model is asked for strict JSON (a schema in the prompt plus
 * {@code response_format: json_object}), and its output is parsed and
 * structurally validated. The degrade path is a <em>validation-repair</em>, not
 * a plain retry: nothing deterministic can parse a program, so the one recovery
 * that helps is showing the model the exact problem with its own JSON and asking
 * it to fix it. One repair only — a temperature-0 model that fails the same
 * schema twice will fail a third time.
 *
 * <p>Three outcomes are kept distinct because the caller maps them to different
 * HTTP statuses and metric labels:
 * <ul>
 *   <li><b>success</b> — a program, ids assigned;
 *   <li><b>rejection</b> — {@code is_program: false} with a reason (the text is
 *       a recipe, an essay): the system worked, the input was not a program;
 *   <li><b>truncation</b> — the JSON hit the token ceiling. Retrying regenerates
 *       the same doomed document, so this throws immediately rather than
 *       repairing, and the caller reports "too large" instead of timing out.
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProgramNormalizer {

    private static final int MAX_ATTEMPTS = 2;

    private static final String SYSTEM_PROMPT = """
            You convert a pasted strength-training program into JSON.

            Output a single JSON object, nothing else:

            {
              "is_program": bool,      // false if the text is not a training program
              "reason": string|null,   // only when is_program is false: one short sentence why
              "program": {             // only when is_program is true
                "title": string|null,
                "notes": string|null,
                "warnings": [string],  // anything you could not structure, one note each
                "weeks": [{
                  "label": string,     // "Week 1" — invent sequential labels if unnamed
                  "block": string|null,
                  "notes": string|null,
                  "days": [{
                    "label": string,   // "Day 1" / "Monday" — invent "Day N" if unnamed
                    "notes": string|null,
                    "exercises": [{
                      "name": string,
                      "sets": int|null,
                      "reps_min": int|null,   // "3x8-10" -> sets 3, reps_min 8, reps_max 10
                      "reps_max": int|null,   // single rep value -> min == max
                      "amrap": bool,          // "AMRAP" -> true, reps null
                      "rpe": number|null,     // "RPE 7-8" -> rpe 7, rpe_max 8
                      "rpe_max": number|null,
                      "percentage": number|null,  // % of 1RM, 0-100
                      "superset_group": string|null,  // same letter = performed together
                      "notes": string|null,
                      "raw": string|null      // the original line, when parsing was lossy
                    }]
                  }]
                }]
              }
            }

            Rules:
            - Never invent training content that is not in the text.
            - COMPACTNESS IS CRITICAL. Omit every field whose value would be null,
              "amrap" when false, and "warnings" when empty — leave the key out
              entirely, do NOT write it with a null/empty value. Omitted fields are
              filled with defaults automatically. A bloated object per exercise
              makes the output many times larger and can get it cut off.
            - Include "raw" ONLY when a line resisted structuring (lossy parse) — and
              add a warning for it. Cleanly parsed lines get no "raw".
            - Do NOT output "id" fields anywhere — they are assigned elsewhere.
            - If the program repeats ("weeks 1-4 the same"), expand into explicit weeks.
            - is_program is false only when the text is genuinely not a training program
              (a recipe, an essay); a sloppy or partial program is still a program.

            Example of the required compact style — note how every field that would be
            null is simply absent, never written out as null:
            {"is_program":true,"program":{"title":"My Program","weeks":[{"label":"Week 1",\
            "days":[{"label":"Day 1","exercises":[\
            {"name":"Squat","sets":3,"reps_min":5,"reps_max":5,"rpe":8},\
            {"name":"Bench","sets":3,"reps_min":8,"reps_max":10}]}]}]}}""";

    private final ChatClient chatClient;
    private final OrchestratorProperties properties;
    private final ObjectMapper mapper;

    /**
     * Normalizes {@code programText}. Returns a success (program, ids assigned)
     * or a rejection; throws {@link TruncatedException} when the output exceeded
     * the token ceiling, or {@link NormalizationException} when the model could
     * not produce valid JSON after one repair.
     */
    public ProgramNormalizeResponse normalize(String programText, RequestMetrics metrics) {
        metrics.setGeneratorModel(properties.models().programNormalize());

        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(SYSTEM_PROMPT));
        messages.add(new UserMessage(programText));

        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            ChatResponse response = chatClient.prompt(prompt(messages)).call().chatResponse();
            String content = textOf(response);
            recordUsage(response, metrics);
            metrics.setGenerationFinishReason(finishReasonOf(response));

            if ("length".equalsIgnoreCase(metrics.generationFinishReason())) {
                log.info("normalize output truncated at token ceiling, attempt {}", attempt);
                throw new TruncatedException();
            }

            ProgramNormalizeResponse parsed = null;
            List<String> problems;
            try {
                parsed = mapper.readValue(content, ProgramNormalizeResponse.class);
                problems = validate(parsed);
            } catch (Exception e) {
                problems = List.of("The output was not valid JSON: " + e.getMessage());
            }

            if (problems.isEmpty()) {
                if (parsed.isProgram()) {
                    Program withIds = NodeIds.assign(parsed.program());
                    int exercises = withIds.weeks().stream()
                            .flatMap(week -> week.days().stream())
                            .mapToInt(day -> day.exercises().size())
                            .sum();
                    // Exercises + completion_tokens are the cost/size signal: watch
                    // tokens-per-exercise creep (compact ~25, verbose ~160).
                    log.info("normalize done: model={} weeks={} exercises={} "
                                    + "prompt_tokens={} completion_tokens={} warnings={} attempt={}",
                            properties.models().programNormalize(), withIds.weeks().size(), exercises,
                            metrics.promptTokens(), metrics.completionTokens(),
                            withIds.warnings().size(), attempt);
                    return ProgramNormalizeResponse.of(withIds);
                }
                log.info("normalize rejected input as non-program");
                return parsed;
            }

            // Feed the model its own output and the exact problem, so the retry
            // is a repair rather than a re-roll of the same failing generation.
            log.info("normalize attempt {} failed validation", attempt);
            log.debug("normalize validation problems: {}", problems);
            messages.add(new AssistantMessage(content != null ? content : ""));
            messages.add(new UserMessage("Your JSON failed validation:\n"
                    + String.join("\n", problems) + "\n\nReturn the corrected JSON object only."));
        }

        throw new NormalizationException("normalizer output failed validation after repair");
    }

    /**
     * Structural checks the type system cannot enforce: a program must be
     * present when claimed, and every exercise needs a name. A violation feeds
     * the repair loop, mirroring what a schema validator would reject.
     */
    private List<String> validate(ProgramNormalizeResponse response) {
        List<String> problems = new ArrayList<>();
        if (!response.isProgram()) {
            return problems;     // a rejection needs no program
        }
        if (response.program() == null) {
            problems.add("is_program is true but program is missing");
            return problems;
        }
        for (ProgramWeek week : response.program().weeks()) {
            for (ProgramDay day : week.days()) {
                for (ExercisePrescription exercise : day.exercises()) {
                    if (exercise.name() == null || exercise.name().isBlank()) {
                        problems.add("an exercise in " + week.label() + " / " + day.label()
                                + " is missing a name");
                    }
                }
            }
        }
        return problems;
    }

    private Prompt prompt(List<Message> messages) {
        var jsonObject = OpenAiChatModel.ResponseFormat.builder()
                .type(OpenAiChatModel.ResponseFormat.Type.JSON_OBJECT)
                .build();
        var options = ChatModelConfig.optionsFor(properties.models().programNormalize())
                .temperature(0.0)
                .maxTokens(properties.models().programMaxTokens())
                .responseFormat(jsonObject)
                .build();
        return new Prompt(messages, options);
    }

    private static String finishReasonOf(ChatResponse response) {
        if (response == null || response.getResult() == null
                || response.getResult().getMetadata() == null) {
            return null;
        }
        return response.getResult().getMetadata().getFinishReason();
    }

    private static String textOf(ChatResponse response) {
        if (response == null || response.getResult() == null) {
            return "";
        }
        AssistantMessage output = response.getResult().getOutput();
        return output != null && output.getText() != null ? output.getText() : "";
    }

    private static void recordUsage(ChatResponse response, RequestMetrics metrics) {
        if (response == null || response.getMetadata() == null) {
            return;
        }
        Usage usage = response.getMetadata().getUsage();
        if (usage != null) {
            metrics.addUsage(usage.getPromptTokens(), usage.getCompletionTokens());
        }
    }

    /** The model could not produce schema-valid output after a repair. */
    public static class NormalizationException extends RuntimeException {
        public NormalizationException(String message) {
            super(message);
        }
    }

    /**
     * The output hit the token ceiling. A separate type from
     * {@link NormalizationException} so the caller can report a program too
     * large to import rather than a generation failure.
     */
    public static class TruncatedException extends RuntimeException {
        public TruncatedException() {
            super("normalizer output exceeded the token ceiling");
        }
    }
}
