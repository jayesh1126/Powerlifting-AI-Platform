package com.powerlifting.orchestrator.chat.runtime;

import com.powerlifting.orchestrator.observability.RequestMetrics;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Post-generation sanity checks.
 *
 * <p>Deliberately cheap: a handful of invariants that flag a broken turn (an
 * empty answer, planned retrieval that found nothing, a planned tool that never
 * ran). They are recorded on {@link RequestMetrics} for later analysis and never
 * block the stream the user has already received. This is the seam where richer
 * evaluation (grounding / hallucination scoring) would plug in.
 *
 * <p>Issue strings are a fixed, bounded set because they are intended to become
 * metric label values; they must never carry request-specific data.
 */
@Component
@Slf4j
public class Verifier {

    public static final String EMPTY_ANSWER = "empty_answer";
    public static final String RETRIEVAL_PLANNED_BUT_NO_DOCS = "retrieval_planned_but_no_docs";
    public static final String LIFTER_DATA_PLANNED_BUT_NO_TOOL_CALLS =
            "lifter_data_planned_but_no_tool_calls";
    public static final String ALL_TOOL_CALLS_FAILED = "all_tool_calls_failed";

    /** Raised by the chat service (not this class) when the whole turn throws. */
    public static final String RUNTIME_ERROR = "runtime_error";

    /**
     * Every issue string that can ever be produced. The bounded set exists so
     * instrumentation can pre-register a zero-valued series for each, keeping
     * rate() queries well-defined before the first occurrence.
     */
    public static final Set<String> ALL_ISSUES = Set.of(
            EMPTY_ANSWER,
            RETRIEVAL_PLANNED_BUT_NO_DOCS,
            LIFTER_DATA_PLANNED_BUT_NO_TOOL_CALLS,
            ALL_TOOL_CALLS_FAILED,
            RUNTIME_ERROR);

    public List<String> verify(RuntimeContext ctx, ExecutionPlan plan, String answer,
                               int docsRetrieved, RequestMetrics metrics) {
        List<String> issues = new ArrayList<>();

        if (answer == null || answer.isBlank()) {
            issues.add(EMPTY_ANSWER);
        }

        if (plan.retrieve() && docsRetrieved == 0) {
            issues.add(RETRIEVAL_PLANNED_BUT_NO_DOCS);
        }

        if (plan.lifterData() && metrics.toolsUsed().isEmpty()) {
            issues.add(LIFTER_DATA_PLANNED_BUT_NO_TOOL_CALLS);
        }

        // Tools ran but every call failed — the answer is running on no data
        // (e.g. DB unreachable) even though tools_used looks healthy.
        if (!metrics.toolsUsed().isEmpty()
                && metrics.toolErrors().size() >= metrics.toolsUsed().size()) {
            issues.add(ALL_TOOL_CALLS_FAILED);
        }

        if (!issues.isEmpty()) {
            log.warn("verifier issues chat={}: {}", ctx.request().chatId(), issues);
        }
        return issues;
    }
}
