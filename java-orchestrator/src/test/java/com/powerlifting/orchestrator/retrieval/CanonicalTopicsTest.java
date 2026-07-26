package com.powerlifting.orchestrator.retrieval;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Topic sanitising is the guard between an 8B model's imagination and the RPC
 * argument. Topics boost rather than filter in match_knowledge_v3, so a bad
 * topic costs ranking quality — but an unparseable one would cost the request.
 */
class CanonicalTopicsTest {

    @Test
    void hallucinatedTopicsAreDroppedWithoutLosingTheGoodOnes() {
        List<String> topics = CanonicalTopics.sanitize(
                List.of("squat", "banana", "bracing", "quantum_lifting"), List.of());

        assertThat(topics).containsExactly("bracing", "squat");
    }

    @Test
    void extrasAreMergedAndDeduplicated() {
        List<String> topics = CanonicalTopics.sanitize(
                List.of("programming", "squat"), List.of("programming", "deload"));

        assertThat(topics).containsExactly("deload", "programming", "squat");
    }

    @Test
    void outputIsSortedSoTheRpcArgumentIsStable() {
        List<String> topics = CanonicalTopics.sanitize(
                List.of("volume", "bench", "rehab"), List.of());

        assertThat(topics).isSorted();
    }

    @Test
    void nullsAreTolerated() {
        assertThat(CanonicalTopics.sanitize(null, null)).isEmpty();
    }

    @Test
    void programTopicsAreAllCanonical() {
        // A typo here would silently disable the boost for every program answer.
        assertThat(CanonicalTopics.DEFAULT_PROGRAM_TOPICS)
                .allMatch(CanonicalTopics::isCanonical);
    }

    @Test
    void theVocabularyIsExposedToThePromptInFull() {
        String promptList = CanonicalTopics.asPromptList();

        assertThat(promptList.lines()).hasSize(CanonicalTopics.ALL.size());
        assertThat(promptList).contains("- squat").contains("- fatigue_management");
    }
}
