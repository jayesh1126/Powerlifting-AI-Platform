package com.powerlifting.orchestrator.chat.runtime;

import com.fasterxml.jackson.annotation.JsonClassDescription;
import com.fasterxml.jackson.annotation.JsonPropertyDescription;

/**
 * The LLM-facing shape of a plan — exactly the fields the model is allowed to
 * choose, and no more.
 *
 * <p>Separate from {@link ExecutionPlan} on purpose: {@code planner} records
 * whether the decision came from the model or the fallback, so letting the
 * model see (and therefore set) it would corrupt the very field used to
 * evaluate it. A distinct type makes that structurally impossible.
 *
 * <p>The flags are boxed and defaulted rather than primitive {@code boolean}.
 * A small model that omits one field would otherwise fail deserialization
 * outright and throw away an otherwise perfectly good plan — observed with
 * llama-3.1-8b omitting {@code programDesign}. Treating a missing flag as
 * "capability not needed" degrades one decision instead of all three.
 *
 * <p>The descriptions are not decoration: Spring AI derives the JSON schema
 * sent to the model from this record, so they are the prompt.
 */
@JsonClassDescription("Which capabilities are needed to answer a powerlifting question")
public record PlannerDecision(

        @JsonPropertyDescription("""
        Search the curated coaching knowledge base — technique, programming, \
        injuries, recovery, rules, meet prep. Set FALSE when the user only wants \
        a specific lifter's competition numbers, records, or rankings with no \
        coaching question attached (a pure data lookup).""")
        Boolean retrieve,

        @JsonPropertyDescription("""
                Query the OpenPowerlifting competition results database. Needed when the \
                user mentions specific lifters by name, records, rankings, leaderboards, \
                "top N", meet results, or comparisons against real athletes.""")
        Boolean lifterData,

        @JsonPropertyDescription("""
                Generate or modify a full training program. Needed when the user asks for \
                a program/plan/routine over weeks, or changes to one.""")
        Boolean programDesign,

        @JsonPropertyDescription("One short sentence explaining the choice")
        String reasoning) {

    public PlannerDecision {
        retrieve = retrieve != null && retrieve;
        lifterData = lifterData != null && lifterData;
        programDesign = programDesign != null && programDesign;
        reasoning = reasoning != null ? reasoning : "";
    }

    public ExecutionPlan toPlan(String planner) {
        return new ExecutionPlan(retrieve, lifterData, programDesign, reasoning, planner);
    }
}
