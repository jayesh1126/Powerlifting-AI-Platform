package com.powerlifting.orchestrator.chat.runtime;

import com.powerlifting.orchestrator.config.ChatModelConfig;
import com.powerlifting.orchestrator.config.OrchestratorProperties;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Component;

/**
 * Decides WHICH capabilities a request needs — nothing else.
 *
 * <p>It never answers, and it never picks tool <em>arguments</em>: only the
 * model mid-reasoning knows which lifter name to look up, so that belongs to
 * the generator's tool loop.
 *
 * <p>The JSON schema and format instructions are derived by Spring AI from
 * {@link PlannerDecision}, so the schema can never drift from the type it
 * parses into. The prompt carries only what a schema cannot express — what the
 * capabilities <em>mean</em>.
 *
 * <p>A keyword heuristic takes over if the model call fails, so a planner
 * outage degrades routing quality instead of failing the request.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class Planner {

    private static final String SYSTEM_PROMPT = """
            You are a request planner for a powerlifting AI coach.

            Given the user's message (and conversation summary if present), decide which
            capabilities are needed to answer it. Multiple capabilities can be true at once.

            You never answer the question yourself, and you never choose tool arguments.""";

    private static final Pattern LIFTER_DATA_PATTERN = Pattern.compile(
            "\\b(record|top \\d+|top ten|leaderboard|rank|best (male|female|lifter)|ipf|"
                    + "openpowerlifting|total|dots|wilks|goodlift|meet result|"
                    + "competition result|compare)\\b",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern PROGRAM_PATTERN = Pattern.compile(
            "\\b(program|routine|plan|weeks?|block|peaking|meso ?cycle|template)\\b",
            Pattern.CASE_INSENSITIVE);

    private final ChatClient chatClient;
    private final OrchestratorProperties properties;

    public ExecutionPlan plan(RuntimeContext ctx) {
        String userContent = ctx.hasSummary()
                ? "Conversation summary:\n" + ctx.summary() + "\n\nUser message:\n" + ctx.query()
                : ctx.query();

        try {
            PlannerDecision decision = chatClient.prompt()
                    .options(ChatModelConfig.optionsFor(properties.models().planner())
                            .temperature(0.0)
                            .maxTokens(400))
                    .system(SYSTEM_PROMPT)
                    .user(userContent)
                    .call()
                    .entity(PlannerDecision.class);

            if (decision == null) {
                throw new IllegalStateException("planner returned no parseable decision");
            }

            ExecutionPlan plan = decision.toPlan(ExecutionPlan.LLM);
            // Reasoning paraphrases the user's query — DEBUG only. The metrics
            // event carries the full plan for observability.
            log.debug("plan: {}", plan);
            log.info("plan[{}]: retrieve={} lifter_data={} program_design={}",
                    properties.models().planner(), plan.retrieve(), plan.lifterData(), plan.programDesign());
            return plan;
        } catch (Exception e) {
            log.warn("LLM planner failed — falling back to heuristic: {}", e.toString());
            return heuristicPlan(ctx.query());
        }
    }

    /** Deterministic fallback — coarse, but keeps routing working. */
    ExecutionPlan heuristicPlan(String query) {
        boolean lifterData = LIFTER_DATA_PATTERN.matcher(query).find();
        boolean programDesign = PROGRAM_PATTERN.matcher(query).find();
        return new ExecutionPlan(
                !lifterData || programDesign,
                lifterData,
                programDesign,
                "keyword heuristic",
                ExecutionPlan.HEURISTIC);
    }
}
