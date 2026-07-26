package com.powerlifting.orchestrator.chat.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The heuristic planner is what runs whenever the LLM planner is unavailable or
 * fails, so it is the floor on routing quality — and unlike the LLM path it is
 * deterministic and therefore testable.
 */
class PlannerHeuristicTest {

    private final Planner planner = new Planner(null, null);

    @ParameterizedTest
    @ValueSource(strings = {
            "who holds the world record total",
            "top 10 female lifters in the UK",
            "how does my squat compare to Russel Orhii",
            "show me the leaderboard for 83kg"})
    void competitionDataQueriesRequestLifterData(String query) {
        assertThat(planner.heuristicPlan(query).lifterData()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "write me a 12 week program",
            "can you fix my routine",
            "I need a peaking block",
            "build a mesocycle for me"})
    void programQueriesRequestProgramDesign(String query) {
        assertThat(planner.heuristicPlan(query).programDesign()).isTrue();
    }

    @Test
    void ordinaryTechniqueQuestionsOnlyRetrieve() {
        ExecutionPlan plan = planner.heuristicPlan("why do my knees cave in when I squat?");

        assertThat(plan.retrieve()).isTrue();
        assertThat(plan.lifterData()).isFalse();
        assertThat(plan.programDesign()).isFalse();
    }

    @Test
    void pureDataLookupsSkipRetrieval() {
        // Retrieval costs an embedding call and adds latency; a leaderboard
        // question has nothing to gain from the knowledge base.
        assertThat(planner.heuristicPlan("top 10 lifters by dots").retrieve()).isFalse();
    }

    @Test
    void aProgramRequestStillRetrievesEvenWhenItMentionsData() {
        // "compare" trips the lifter-data pattern, but programming theory is
        // still wanted, so retrieval must stay on.
        ExecutionPlan plan = planner.heuristicPlan("compare my program to a peaking block");

        assertThat(plan.lifterData()).isTrue();
        assertThat(plan.programDesign()).isTrue();
        assertThat(plan.retrieve()).isTrue();
    }

    @Test
    void theFallbackIsLabelledSoEvaluationCanTellThemApart() {
        assertThat(planner.heuristicPlan("anything").planner()).isEqualTo(ExecutionPlan.HEURISTIC);
    }
}
