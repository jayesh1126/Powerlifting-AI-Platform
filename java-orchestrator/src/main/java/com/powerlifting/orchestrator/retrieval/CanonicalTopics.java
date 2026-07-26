package com.powerlifting.orchestrator.retrieval;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The topic vocabulary the knowledge-base chunks are tagged with.
 *
 * <p>The rewrite model must pick from this list so topic boosting matches the
 * stored metadata; anything else it invents is dropped. Topics <em>boost</em>
 * rather than filter in {@code match_knowledge_v3}, so a wrong-but-valid topic
 * costs ranking quality, not recall.
 */
public final class CanonicalTopics {

    public static final List<String> ALL = List.of(
            // Core lifts
            "squat", "bench", "deadlift",
            // Technique & movement
            "technique", "positioning", "bracing", "variations", "accessories",
            // Programming & training theory
            "programming", "periodization", "peaking", "tapering", "deload",
            "fatigue_management", "volume", "rpe", "specificity", "progress",
            "training_plateaus",
            // Injuries & rehab
            "injuries", "rehab", "pain_management", "lower_back", "hypermobility",
            "sciatica",
            // Competition & rules
            "competition", "meet_prep", "ipf_rules", "weight_class", "externals",
            // Physiology & lifestyle
            "recovery", "diet", "cutting", "mental", "muscle",
            // Equipment
            "equipment");

    private static final Set<String> LOOKUP = Set.copyOf(ALL);

    /** Pulled in whenever the planner grants program design. */
    public static final List<String> DEFAULT_PROGRAM_TOPICS = List.of(
            "programming", "recovery", "injuries", "rehab", "pain_management",
            "periodization", "peaking", "tapering", "deload", "fatigue_management",
            "volume", "rpe", "specificity", "progress", "training_plateaus");

    private CanonicalTopics() {
    }

    public static boolean isCanonical(String topic) {
        return topic != null && LOOKUP.contains(topic);
    }

    /**
     * Drops hallucinated topics instead of failing the request, then merges in
     * any extras. Sorted and de-duplicated so the RPC argument is stable.
     */
    public static List<String> sanitize(List<String> proposed, List<String> extras) {
        Set<String> merged = new LinkedHashSet<>();
        if (proposed != null) {
            proposed.stream().filter(CanonicalTopics::isCanonical).forEach(merged::add);
        }
        if (extras != null) {
            extras.stream().filter(CanonicalTopics::isCanonical).forEach(merged::add);
        }
        return merged.stream().sorted().toList();
    }

    /** Bulleted form for the rewrite prompt. */
    public static String asPromptList() {
        return ALL.stream().map(t -> "- " + t).reduce((a, b) -> a + "\n" + b).orElse("");
    }
}
