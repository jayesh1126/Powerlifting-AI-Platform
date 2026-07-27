package com.powerlifting.orchestrator.programs.runtime;

import com.powerlifting.orchestrator.programs.model.ExercisePrescription;
import com.powerlifting.orchestrator.programs.model.Program;
import com.powerlifting.orchestrator.programs.model.ProgramDay;
import com.powerlifting.orchestrator.programs.model.ProgramWeek;
import com.powerlifting.orchestrator.programs.model.Suggestion;
import com.powerlifting.orchestrator.programs.model.SuggestionKind;
import com.powerlifting.orchestrator.stream.StreamEvent;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * Turns the model's streamed JSONL into validated events, one line at a time.
 *
 * <p>The contract with the model is "one JSON object per line": a first
 * {@code assessment} line, then suggestion lines. The model is untrusted output,
 * so the discipline here is <b>parse tolerantly, validate strictly, drop
 * loudly</b> — a malformed line, an unknown edit kind, a hallucinated target id
 * or a bad payload is dropped and counted, never emitted. That is what lets a
 * prompt-only JSONL contract (no structured-output guarantee) be safe: a bad
 * suggestion cannot reach the client.
 *
 * <p>Stateful and single-use: one parser per suggest request, fed on the
 * request's own virtual thread. {@link #feed} handles the streaming case (a line
 * at a time); {@link #feedArray} is the fallback for a model that emits one JSON
 * array instead of line-delimited objects.
 */
@Slf4j
public final class SuggestLineParser {

    static final int MAX_SUGGESTIONS = 12;

    // Drop reasons — logged per line, summed into the emitted/dropped metric.
    static final String BAD_JSON = "bad_json";
    static final String BAD_SHAPE = "bad_shape";
    static final String BAD_TARGET = "bad_target";
    static final String BAD_PAYLOAD = "bad_payload";
    static final String OVER_CAP = "over_cap";

    // The only keys a modify_exercise patch may carry (snake_case, as on the
    // wire). Anything else — including id/raw — rejects the suggestion.
    private static final Set<String> PATCH_KEYS = Set.of(
            "name", "sets", "reps_min", "reps_max", "amrap",
            "rpe", "rpe_max", "percentage", "superset_group", "notes");

    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE =
            new TypeReference<>() {
            };

    private final ObjectMapper mapper;
    private final Set<String> exerciseIds;
    private final Set<String> dayIds;
    private final Set<String> weekIds;

    private String assessment;
    private final List<Suggestion> suggestions = new ArrayList<>();
    private final Map<String, Integer> drops = new LinkedHashMap<>();

    public SuggestLineParser(Program program, ObjectMapper mapper) {
        this.mapper = mapper;
        this.exerciseIds = new LinkedHashSet<>();
        this.dayIds = new LinkedHashSet<>();
        this.weekIds = new LinkedHashSet<>();
        for (ProgramWeek week : program.weeks()) {
            weekIds.add(week.id());
            for (ProgramDay day : week.days()) {
                dayIds.add(day.id());
                for (ExercisePrescription exercise : day.exercises()) {
                    exerciseIds.add(exercise.id());
                }
            }
        }
    }

    /**
     * Feeds one line. Returns the event to emit, or {@code null} if the line
     * was blank, a stray fence, or dropped.
     */
    public StreamEvent feed(String line) {
        String trimmed = line.strip();
        if (trimmed.isEmpty() || trimmed.startsWith("```")) {
            return null;     // blank or a stray markdown fence — tolerate, don't count
        }
        RawLine raw;
        try {
            raw = mapper.readValue(trimmed, RawLine.class);
        } catch (Exception e) {
            drop(BAD_JSON);
            return null;
        }
        return handle(raw);
    }

    /**
     * Fallback when line-by-line parsing yielded nothing: the model may have
     * emitted a single JSON array of the same objects. Returns every event the
     * array produced (empty if it was not a parseable array).
     */
    public List<StreamEvent> feedArray(String text) {
        RawLine[] lines;
        try {
            lines = mapper.readValue(text.strip(), RawLine[].class);
        } catch (Exception e) {
            return List.of();
        }
        List<StreamEvent> events = new ArrayList<>();
        for (RawLine raw : lines) {
            StreamEvent event = handle(raw);
            if (event != null) {
                events.add(event);
            }
        }
        return events;
    }

    private StreamEvent handle(RawLine raw) {
        if ("assessment".equals(raw.kind())) {
            if (assessment == null && raw.text() != null && !raw.text().isBlank()) {
                assessment = raw.text();
                return new StreamEvent.Assessment(assessment);
            }
            return null;     // a second assessment, or an empty one — ignore
        }
        if (suggestions.size() >= MAX_SUGGESTIONS) {
            drop(OVER_CAP);
            return null;
        }
        Suggestion suggestion = validate(raw, suggestions.size() + 1);
        if (suggestion == null) {
            return null;     // validate() already recorded the specific drop
        }
        suggestions.add(suggestion);
        return new StreamEvent.SuggestionEvent(suggestion);
    }

    /** One raw line to a validated Suggestion, or {@code null} (drop recorded). */
    private Suggestion validate(RawLine raw, int seq) {
        SuggestionKind kind = SuggestionKind.fromWire(raw.kind());
        if (kind == null || raw.rationale() == null || raw.rationale().isBlank()) {
            return dropped(BAD_SHAPE);
        }

        // The model is told never to emit ids, but it sometimes does; strip
        // rather than trust. Prompts request, code enforces.
        Map<String, Object> payload = raw.payload() != null
                ? new LinkedHashMap<>(raw.payload()) : new LinkedHashMap<>();
        payload.remove("id");
        String target = raw.targetId();
        Map<String, Object> finalPayload = null;

        switch (kind) {
            case MODIFY_EXERCISE -> {
                if (!exerciseIds.contains(target)) {
                    return dropped(BAD_TARGET);
                }
                if (payload.isEmpty() || !isValidPatch(payload)) {
                    return dropped(BAD_PAYLOAD);
                }
                finalPayload = payload;
            }
            case ADD_EXERCISE -> {
                if (!dayIds.contains(target)) {
                    return dropped(BAD_TARGET);
                }
                ExercisePrescription exercise = readExercise(payload);
                if (exercise == null) {
                    return dropped(BAD_PAYLOAD);
                }
                finalPayload = toMap(exercise.withId(NodeIds.freshId()));
            }
            case REMOVE_EXERCISE -> {
                if (!exerciseIds.contains(target)) {
                    return dropped(BAD_TARGET);
                }
            }
            case ADD_DAY -> {
                if (!weekIds.contains(target)) {
                    return dropped(BAD_TARGET);
                }
                ProgramDay day = readDay(payload);
                if (day == null) {
                    return dropped(BAD_PAYLOAD);
                }
                finalPayload = toMap(freshDayIds(day));
            }
            case REMOVE_DAY -> {
                if (!dayIds.contains(target)) {
                    return dropped(BAD_TARGET);
                }
            }
            case PROGRAM_NOTE -> target = null;     // advice only, targets nothing
        }
        return new Suggestion("s" + seq, kind, target, finalPayload, raw.rationale());
    }

    /** Keys within the allowed set and every value the right type. */
    private boolean isValidPatch(Map<String, Object> payload) {
        if (!PATCH_KEYS.containsAll(payload.keySet())) {
            return false;
        }
        try {
            mapper.convertValue(payload, ExercisePatch.class);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** A full exercise, or {@code null} if the payload is not one. */
    private ExercisePrescription readExercise(Map<String, Object> payload) {
        try {
            ExercisePrescription exercise = mapper.convertValue(payload, ExercisePrescription.class);
            return exercise.name() != null && !exercise.name().isBlank() ? exercise : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** A full day, or {@code null} if the payload is not one. */
    private ProgramDay readDay(Map<String, Object> payload) {
        try {
            ProgramDay day = mapper.convertValue(payload, ProgramDay.class);
            return day.label() != null && !day.label().isBlank() ? day : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** Fresh ids for an added day and every exercise it brings. */
    private ProgramDay freshDayIds(ProgramDay day) {
        List<ExercisePrescription> exercises = new ArrayList<>(day.exercises().size());
        for (ExercisePrescription exercise : day.exercises()) {
            exercises.add(exercise.withId(NodeIds.freshId()));
        }
        return day.withId(NodeIds.freshId()).withExercises(exercises);
    }

    private Map<String, Object> toMap(Object node) {
        return mapper.convertValue(node, MAP_TYPE);
    }

    private Suggestion dropped(String reason) {
        drop(reason);
        return null;
    }

    private void drop(String reason) {
        drops.merge(reason, 1, Integer::sum);
        log.info("suggestion dropped: {}", reason);
    }

    public String assessment() {
        return assessment;
    }

    public List<Suggestion> suggestions() {
        return suggestions;
    }

    public int emittedCount() {
        return suggestions.size();
    }

    public int droppedCount() {
        return drops.values().stream().mapToInt(Integer::intValue).sum();
    }

    /** Per-reason drop counts, for tests and debugging. */
    public Map<String, Integer> drops() {
        return drops;
    }

    /**
     * One line of the model's JSONL, parsed leniently. A distinct type from the
     * validated {@link Suggestion} because these fields are untrusted until
     * checked, and {@code kind} is a raw string so an unknown value is a drop,
     * not a deserialization failure that discards the whole line unexamined.
     */
    private record RawLine(
            String kind,
            String text,
            String targetId,
            Map<String, Object> payload,
            String rationale) {
    }
}
