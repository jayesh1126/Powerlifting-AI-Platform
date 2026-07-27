package com.powerlifting.orchestrator.programs.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.powerlifting.orchestrator.programs.model.ExercisePrescription;
import com.powerlifting.orchestrator.programs.model.Program;
import com.powerlifting.orchestrator.programs.model.ProgramDay;
import com.powerlifting.orchestrator.programs.model.ProgramWeek;
import com.powerlifting.orchestrator.programs.model.Suggestion;
import com.powerlifting.orchestrator.programs.model.SuggestionKind;
import com.powerlifting.orchestrator.stream.StreamEvent;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.json.JsonMapper;

/**
 * The suggestion pipeline consumes untrusted model output, so this proves the
 * "parse tolerantly, validate strictly, drop loudly" contract: a bad line never
 * becomes an emitted suggestion, and every rejection is counted.
 */
class SuggestLineParserTest {

    // Mirrors the two Jackson settings the parser depends on in production
    // (application.properties): snake_case wire names and lenient unknown props.
    private static final ObjectMapper MAPPER = JsonMapper.builder()
            .propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .build();

    /** One week, one day, one exercise — ids assigned exactly as production does. */
    private static Program program() {
        return NodeIds.assign(new Program(null, List.of(
                new ProgramWeek(null, "Week 1", null, List.of(
                        new ProgramDay(null, "Day 1", List.of(
                                new ExercisePrescription(null, "Squat", 3, 5, 5,
                                        false, 9.0, null, null, null, null, null)),
                                null)),
                        null)),
                null, null));
    }

    @Test
    void nodeIdsArePositionalAndUnique() {
        Program p = program();
        assertThat(p.weeks().getFirst().id()).isEqualTo("w1");
        assertThat(p.weeks().getFirst().days().getFirst().id()).isEqualTo("w1d1");
        assertThat(p.weeks().getFirst().days().getFirst().exercises().getFirst().id())
                .isEqualTo("w1d1e1");
    }

    @Test
    void everyHostileLineClassIsDroppedAndCounted() {
        SuggestLineParser parser = new SuggestLineParser(program(), MAPPER);

        List<String> lines = List.of(
                "{\"kind\":\"assessment\",\"text\":\"looks fine\"}",
                "{\"kind\":\"modify_exercise\",\"target_id\":\"w9d9e9\",\"payload\":{\"sets\":2},\"rationale\":\"x\"}",
                "{\"kind\":\"modify_exercise\",\"target_id\":\"w1d1e1\",\"payload\":{\"hack\":true},\"rationale\":\"x\"}",
                "{\"kind\":\"teleport_exercise\",\"target_id\":\"w1d1e1\",\"rationale\":\"x\"}",
                "not even json",
                "{\"kind\":\"modify_exercise\",\"target_id\":\"w1d1e1\",\"payload\":{\"sets\":2,\"id\":\"evil\"},\"rationale\":\"legit\"}");

        for (String line : lines) {
            parser.feed(line);
        }

        assertThat(parser.assessment()).isEqualTo("looks fine");
        assertThat(parser.suggestions()).hasSize(1);
        Suggestion only = parser.suggestions().getFirst();
        assertThat(only.id()).isEqualTo("s1");
        assertThat(only.kind()).isEqualTo(SuggestionKind.MODIFY_EXERCISE);
        assertThat(only.targetId()).isEqualTo("w1d1e1");
        // The leaked "id" is stripped; only the field the model changed remains.
        assertThat(only.payload()).containsExactly(java.util.Map.entry("sets", 2));

        assertThat(parser.drops()).containsOnly(
                java.util.Map.entry(SuggestLineParser.BAD_TARGET, 1),
                java.util.Map.entry(SuggestLineParser.BAD_PAYLOAD, 1),
                java.util.Map.entry(SuggestLineParser.BAD_SHAPE, 1),
                java.util.Map.entry(SuggestLineParser.BAD_JSON, 1));
        assertThat(parser.emittedCount()).isEqualTo(1);
        assertThat(parser.droppedCount()).isEqualTo(4);
    }

    @Test
    void feedReturnsTheEventForEachValidLine() {
        SuggestLineParser parser = new SuggestLineParser(program(), MAPPER);

        StreamEvent assessment = parser.feed(
                "{\"kind\":\"assessment\",\"text\":\"hi\"}");
        StreamEvent suggestion = parser.feed(
                "{\"kind\":\"modify_exercise\",\"target_id\":\"w1d1e1\",\"payload\":{\"rpe\":7},\"rationale\":\"r\"}");

        assertThat(assessment).isInstanceOf(StreamEvent.Assessment.class);
        assertThat(suggestion).isInstanceOf(StreamEvent.SuggestionEvent.class);
        assertThat(parser.feed("   ")).isNull();          // blank line
        assertThat(parser.feed("```json")).isNull();      // stray fence, not counted
        assertThat(parser.droppedCount()).isZero();
    }

    @Test
    void addExerciseGetsAServerAssignedIdAndFullPayload() {
        SuggestLineParser parser = new SuggestLineParser(program(), MAPPER);

        parser.feed("{\"kind\":\"add_exercise\",\"target_id\":\"w1d1\","
                + "\"payload\":{\"name\":\"RDL\",\"sets\":3,\"reps_min\":8,\"reps_max\":8},"
                + "\"rationale\":\"posterior chain\"}");

        assertThat(parser.suggestions()).hasSize(1);
        Object id = parser.suggestions().getFirst().payload().get("id");
        assertThat(id).asString().startsWith("n");
        assertThat(parser.suggestions().getFirst().payload()).containsEntry("name", "RDL");
    }

    @Test
    void addExerciseWithoutANameIsRejected() {
        SuggestLineParser parser = new SuggestLineParser(program(), MAPPER);

        parser.feed("{\"kind\":\"add_exercise\",\"target_id\":\"w1d1\","
                + "\"payload\":{\"sets\":3},\"rationale\":\"r\"}");

        assertThat(parser.suggestions()).isEmpty();
        assertThat(parser.drops()).containsEntry(SuggestLineParser.BAD_PAYLOAD, 1);
    }

    @Test
    void programNoteTargetsNothingAndCarriesNoPayload() {
        SuggestLineParser parser = new SuggestLineParser(program(), MAPPER);

        StreamEvent event = parser.feed(
                "{\"kind\":\"program_note\",\"rationale\":\"add a third day\"}");

        assertThat(event).isInstanceOf(StreamEvent.SuggestionEvent.class);
        Suggestion note = parser.suggestions().getFirst();
        assertThat(note.targetId()).isNull();
        assertThat(note.payload()).isNull();
    }

    @Test
    void suggestionsAreCappedAndOverflowIsCounted() {
        SuggestLineParser parser = new SuggestLineParser(program(), MAPPER);

        for (int i = 0; i < SuggestLineParser.MAX_SUGGESTIONS + 3; i++) {
            parser.feed("{\"kind\":\"modify_exercise\",\"target_id\":\"w1d1e1\","
                    + "\"payload\":{\"rpe\":7},\"rationale\":\"r\"}");
        }

        assertThat(parser.emittedCount()).isEqualTo(SuggestLineParser.MAX_SUGGESTIONS);
        assertThat(parser.drops()).containsEntry(SuggestLineParser.OVER_CAP, 3);
    }

    @Test
    void arrayFallbackParsesAWholeArrayOfObjects() {
        SuggestLineParser parser = new SuggestLineParser(program(), MAPPER);

        List<StreamEvent> events = parser.feedArray(
                "[{\"kind\":\"assessment\",\"text\":\"arr\"},"
                + "{\"kind\":\"remove_exercise\",\"target_id\":\"w1d1e1\",\"rationale\":\"drop it\"}]");

        assertThat(events).hasSize(2);
        assertThat(events.get(0)).isInstanceOf(StreamEvent.Assessment.class);
        assertThat(events.get(1)).isInstanceOf(StreamEvent.SuggestionEvent.class);
    }
}
