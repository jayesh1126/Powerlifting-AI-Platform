package com.powerlifting.orchestrator.chat.runtime;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Which capabilities a request needs. Not mutually exclusive: "compare my squat
 * progression to Russel Orhii and fix my program" legitimately needs lifter
 * data AND knowledge retrieval AND program design.
 *
 * @param planner "llm" or "heuristic" — recorded for evaluation, never chosen
 *                by the model
 */
public record ExecutionPlan(
        boolean retrieve,
        boolean lifterData,
        boolean programDesign,
        String reasoning,
        String planner) {

    public static final String LLM = "llm";
    public static final String HEURISTIC = "heuristic";

    /** Serialized into the metrics event; the key names are part of that wire contract. */
    public Map<String, Object> toMap() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("retrieve", retrieve);
        out.put("lifter_data", lifterData);
        out.put("program_design", programDesign);
        out.put("reasoning", reasoning);
        out.put("planner", planner);
        return out;
    }
}
