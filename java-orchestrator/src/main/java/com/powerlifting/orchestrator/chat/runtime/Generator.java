package com.powerlifting.orchestrator.chat.runtime;

import com.powerlifting.orchestrator.config.OrchestratorProperties;
import com.powerlifting.orchestrator.config.ChatModelConfig;
import com.powerlifting.orchestrator.chat.model.ChatMessage;
import com.powerlifting.orchestrator.stream.EventSink;
import com.powerlifting.orchestrator.stream.StreamEvent;
import com.powerlifting.orchestrator.observability.RequestMetrics;
import com.powerlifting.orchestrator.retrieval.RetrievedContext;
import com.powerlifting.orchestrator.retrieval.RetrievedDoc;
import com.powerlifting.orchestrator.tools.ToolRegistry;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.AdvisorParams;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.AssistantMessage.ToolCall;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Answer generation: a streaming agentic tool loop.
 *
 * <p>The loop is driven here rather than delegated to Spring AI's
 * {@code ToolCallAdvisor}, for two reasons — one behavioural, one measured:
 *
 * <ul>
 *   <li>The round policy is not expressible through the advisor. Round 0 forces
 *       a tool call ({@code tool_choice: required}) because small models
 *       otherwise skip the lookup and confidently claim a lifter is "not in the
 *       dataset"; later rounds are {@code auto} so the model can stop once it
 *       has enough; the final round withholds tools entirely to force a text
 *       answer.
 *   <li>Advisor hooks run on {@code Schedulers.boundedElastic()} (see
 *       PORT_PLAN.md 2.2). Tool execution here is blocking JDBC against
 *       opl-db, so running it in the chain would occupy a bounded platform
 *       thread and lose the MDC request id. Driven from here it runs on the
 *       request's own virtual thread, which parks instead.
 * </ul>
 *
 * <p>Spring AI still owns everything below the loop: tool schemas come from the
 * {@code @Tool} annotations and execution goes through {@link ToolCallback}.
 * The auto-registered tool advisor is switched off so it cannot also execute.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class Generator {

    private static final int MAX_CHARS_PER_EXCERPT = 1400;

    static final String BASE_SYSTEM_PROMPT = """
            You are a professional powerlifting coach.

            Task: Answer the user's questions about strength training, programming, technique, injuries, and competition prep.

            You may receive retrieved training excerpts.
            - Use the retrieved excerpts ONLY if they are relevant to the user's question.
            - If the retrieved excerpts are irrelevant or not helpful, ignore them and answer using general strength training knowledge.
            - Do not invent details that are not supported by the excerpts or the conversation.

            Style:
            - Be concise and practical.
            - If there are multiple valid approaches, briefly mention them.
            - Include safety considerations when relevant (pain/injury red flags).""";

    static final String ANALYTICS_PROMPT_SECTION = """

            COMPETITION DATA TOOLS:
            You have tools that query the official OpenPowerlifting dataset. Use kilograms (kg), not pounds.
            - For any claim about a real lifter's numbers, records, rankings, or meet results you MUST use the tools — never outside knowledge, never fabricate results.
            - get_lifter_history: call when the user mentions a person by name — including "who is X" questions (max 2 lifters per question). NEVER claim a person is or is not in the dataset without calling this first. Attempts: positive = successful, negative = failed, null = not recorded. Compute PRs, totals, success rates, progression from the returned rows only.
            - leaderboard_query: call for "top", "best", "ranked", "leaderboard" questions. Only pass filters the user explicitly asked for — never invent sex/country/class filters.
            - If a name matches several different lifters, ask the user to clarify instead of guessing.
            - If the dataset lacks the information, say so plainly.""";

    static final String PROGRAM_PROMPT_SECTION = """

            PROGRAM DESIGN:
            The user wants a training program created or modified.
            - Follow evidence-based strength training principles and the user's personal requirements from the conversation.
            - Use the design rules and example templates below as guidance.
            - Produce a complete, well-structured program in Markdown tables: weeks, days, sets, reps, RPEs, notes.
            - When modifying an existing program, change only what the user asked for.

            PROGRAM DESIGN RULES & EXAMPLE TEMPLATES:
            """;

    private final ChatClient chatClient;
    private final OrchestratorProperties properties;
    private final PromptTemplates templates;
    private final ToolRegistry toolRegistry;
    private final ObjectMapper mapper;

    /** Streams answer deltas to the sink and returns the assembled answer. */
    public String generate(RuntimeContext ctx, ExecutionPlan plan, RetrievedContext retrieved,
                           RequestMetrics metrics, EventSink sink) {
        metrics.setGeneratorModel(properties.models().generator());

        List<ToolCallback> tools = plan.lifterData() ? toolRegistry.oplTools() : List.of();
        List<Message> messages = buildMessages(ctx, plan, retrieved);
        StringBuilder answer = new StringBuilder();
        int maxRounds = properties.runtime().maxToolRounds();
        long genStart = System.nanoTime();

        for (int round = 0; round <= maxRounds; round++) {
            // The planner granted these tools because the query NEEDS their
            // data, so the first round must use one. The last round withholds
            // them so the model has no choice but to answer.
            boolean allowTools = !tools.isEmpty() && round < maxRounds;

            // Output cap, not context: history/summary growth is bounded by the
            // model's (large) context window and ContextBuilder's trimming, not
            // by this. The headroom is for a long *answer* — e.g. the model
            // writing a full multi-week program inline on a program_design turn.
            OpenAiChatOptions.Builder options = ChatModelConfig.optionsFor(properties.models().generator())
                    .temperature(0.4)
                    .maxTokens(8000)
                    .streamOptions(OpenAiChatOptions.StreamOptions.builder()
                            .includeUsage(true).build());
            if (allowTools) {
                options.toolCallbacks(tools);
                options.toolChoice(round == 0 ? "required" : "auto");
            }

            // Text emitted in THIS round only. A tool-calling round rarely emits
            // text, but if it does, that text belongs to this round's assistant
            // message — using the cumulative answer would replay earlier rounds'
            // text into every subsequent assistant message.
            int roundStart = answer.length();

            List<ToolCall> toolCalls = streamRound(
                    new Prompt(messages, options.build()), answer, metrics, sink, genStart);

            if (toolCalls.isEmpty()) {
                logGenerationOutcome(metrics);
                return answer.toString();     // final answer finished streaming
            }
            executeToolRound(round, toolCalls, tools, messages,
                    answer.substring(roundStart), metrics);
        }
        logGenerationOutcome(metrics);
        return answer.toString();
    }

    /**
     * One content-free line per turn for debugging model behaviour and latency:
     * which model answered, how long until the first token reached the user
     * (streaming health), and why generation stopped. A {@code length} finish
     * reason means the answer was cut off at the token ceiling — loud on its own
     * line because it is otherwise invisible and silently truncates answers.
     */
    private void logGenerationOutcome(RequestMetrics metrics) {
        log.info("generation: model={} ttft_ms={} finish_reason={}",
                metrics.generatorModel(), metrics.ttftMs(), metrics.generationFinishReason());
        if ("length".equalsIgnoreCase(metrics.generationFinishReason())) {
            log.warn("generation stopped at the token ceiling (finish_reason=length) — "
                    + "the answer was truncated; raise the generator maxTokens");
        }
    }

    /**
     * Streams one round, emitting text as it arrives and collecting any tool
     * calls. Returns the tool calls the model asked for, empty if it answered.
     */
    private List<ToolCall> streamRound(Prompt prompt, StringBuilder answer,
                                       RequestMetrics metrics, EventSink sink, long genStart) {
        ToolCallAccumulator toolCalls = new ToolCallAccumulator();
        StreamUsage usage = new StreamUsage();

        // Spring AI exposes streaming only as a Flux (there is no blocking
        // streaming API — the blocking .call() waits for the whole response and
        // gives no live tokens). toStream() is the sanctioned bridge: it pulls
        // the Flux through a bounded queue and blocks the consumer. Blocking a
        // platform thread here would risk pool starvation, but this runs on the
        // request's virtual thread, so the carrier is released while parked.
        // This one call is the entire reactive surface of the service.
        //
        // try-with-resources is load-bearing: close() cancels the Flux, so a
        // client disconnect tears down the upstream LLM connection instead of
        // leaking it until timeout.
        try (Stream<ChatResponse> responses = chatClient.prompt(prompt)
                // Stop Spring AI's own tool advisor from also executing calls;
                // this loop owns the round policy and the metrics.
                .advisors(AdvisorParams.toolCallingAdvisorAutoRegister(false))
                .stream()
                .chatResponse()
                .toStream()) {

            responses.forEach(response -> {
                String delta = textOf(response);
                if (delta != null && !delta.isEmpty()) {
                    metrics.markFirstToken(genStart);   // time-to-first-token, set once
                    answer.append(delta);
                    sink.emit(new StreamEvent.Token(delta));
                }
                String finishReason = finishReasonOf(response);
                if (finishReason != null) {
                    metrics.setGenerationFinishReason(finishReason);   // last non-null wins
                }
                toolCalls.observe(response);
                usage.observe(response);
            });
        }

        metrics.addUsage(usage.promptTokens, usage.completionTokens);
        return toolCalls.isEmpty() ? List.of() : toToolCallList(toolCalls);
    }

    private static String finishReasonOf(ChatResponse response) {
        if (response == null || response.getResult() == null
                || response.getResult().getMetadata() == null) {
            return null;
        }
        return response.getResult().getMetadata().getFinishReason();
    }

    private static List<ToolCall> toToolCallList(ToolCallAccumulator accumulator) {
        return accumulator.toToolCalls();
    }

    /**
     * Executes the requested tools and appends the exchange to the running
     * conversation, so the next round sees what came back.
     */
    private void executeToolRound(int round, List<ToolCall> toolCalls, List<ToolCallback> tools,
                                  List<Message> messages, String roundText,
                                  RequestMetrics metrics) {
        messages.add(AssistantMessage.builder()
                .content(roundText)
                .toolCalls(toolCalls)
                .build());

        // One line per round with the call count, so several parallel calls in
        // a single round read as "round 0: 2 calls" rather than two identical
        // "round 0" lines.
        log.info("tool round {}: {} call(s) {}", round, toolCalls.size(),
                toolCalls.stream().map(ToolCall::name).toList());

        List<ToolResponseMessage.ToolResponse> responses = new ArrayList<>(toolCalls.size());
        for (ToolCall call : toolCalls) {
            // Arguments derive from user content — DEBUG only.
            log.debug("tool call {} args: {}", call.name(), abbreviate(call.arguments()));
            metrics.toolsUsed().add(call.name());

            String result = invoke(call, tools);
            if (isErrorResult(result)) {
                // Our tools always return JSON; an object with "error" means the
                // call failed. Recording it makes silent degradation visible in
                // metrics and to the verifier.
                metrics.toolErrors().add(call.name());
                log.warn("tool {} returned an error result", call.name());
            }
            responses.add(new ToolResponseMessage.ToolResponse(
                    call.id(), call.name(), result));
        }
        messages.add(ToolResponseMessage.builder().responses(responses).build());
    }

    private String invoke(ToolCall call, List<ToolCallback> tools) {
        ToolCallback callback = tools.stream()
                .filter(t -> t.getToolDefinition().name().equals(call.name()))
                .findFirst()
                .orElse(null);

        if (callback == null) {
            return mapper.writeValueAsString(Map.of("error", "Unknown tool " + call.name()));
        }
        try {
            String arguments = call.arguments() != null && !call.arguments().isBlank()
                    ? call.arguments() : "{}";
            return callback.call(arguments);
        } catch (Exception e) {
            // Errors are fed back to the model so it can retry with corrected
            // arguments instead of killing the request.
            log.warn("tool {} threw: {}", call.name(), e.toString());
            return mapper.writeValueAsString(Map.of("error",
                    "Tool " + call.name() + " failed. Try different arguments or answer without it."));
        }
    }

    private boolean isErrorResult(String result) {
        if (result == null || result.isBlank()) {
            return false;
        }
        try {
            JsonNode node = mapper.readTree(result);
            return node.isObject() && node.has("error");
        } catch (Exception e) {
            return false;     // not JSON at all; not our error shape
        }
    }

    private static String abbreviate(String value) {
        if (value == null) {
            return "";
        }
        return value.length() > 200 ? value.substring(0, 200) : value;
    }

    private static String textOf(ChatResponse response) {
        if (response == null || response.getResult() == null) {
            return null;
        }
        AssistantMessage output = response.getResult().getOutput();
        return output != null ? output.getText() : null;
    }

    /** Latest usage seen on a single stream. */
    private static final class StreamUsage {
        private int promptTokens;
        private int completionTokens;

        void observe(ChatResponse response) {
            if (response == null || response.getMetadata() == null) {
                return;
            }
            Usage reported = response.getMetadata().getUsage();
            if (reported == null) {
                return;
            }
            Integer prompt = reported.getPromptTokens();
            Integer completion = reported.getCompletionTokens();
            if (prompt != null && prompt > 0) {
                this.promptTokens = prompt;
            }
            if (completion != null && completion > 0) {
                this.completionTokens = completion;
            }
        }
    }

    /**
     * Builds the initial message list: system prompt, then a second system
     * message holding the retrieved excerpts, then the trimmed history, and the
     * new user query last.
     */
    private List<Message> buildMessages(RuntimeContext ctx, ExecutionPlan plan,
                                        RetrievedContext retrieved) {
        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(buildSystemPrompt(ctx, plan)));
        messages.add(new SystemMessage(buildRetrievedContextMessage(retrieved)));
        messages.addAll(toSpringMessages(ctx.history()));
        messages.add(new UserMessage(ctx.query()));
        return messages;
    }

    String buildSystemPrompt(RuntimeContext ctx, ExecutionPlan plan) {
        StringBuilder prompt = new StringBuilder(BASE_SYSTEM_PROMPT);
        if (plan.lifterData()) {
            prompt.append("\n").append(ANALYTICS_PROMPT_SECTION);
        }
        if (plan.programDesign()) {
            prompt.append("\n").append(PROGRAM_PROMPT_SECTION).append(templates.programTemplates());
        }
        if (ctx.hasSummary()) {
            prompt.append("\n\nConversation summary (preferences/constraints may be here):\n")
                  .append(ctx.summary());
        }
        return prompt.toString();
    }

    static String buildRetrievedContextMessage(RetrievedContext retrieved) {
        List<RetrievedDoc> docs = retrieved != null ? retrieved.documents() : List.of();
        if (docs.isEmpty()) {
            // Stated explicitly rather than omitted: the system prompt tells the
            // model excerpts may be attached, so silence would read as "not yet
            // provided" and invite it to wait for them.
            return "Retrieved training excerpts: (none found)";
        }
        StringBuilder message = new StringBuilder("Retrieved training excerpts:\n\n");
        for (int i = 0; i < docs.size(); i++) {
            if (i > 0) {
                message.append("\n\n---\n\n");
            }
            String content = docs.get(i).content();
            message.append("Excerpt ").append(i + 1).append('\n')
                   .append(content.length() > MAX_CHARS_PER_EXCERPT
                           ? content.substring(0, MAX_CHARS_PER_EXCERPT)
                           : content);
        }
        return message.toString();
    }

    private static List<Message> toSpringMessages(List<ChatMessage> history) {
        List<Message> messages = new ArrayList<>(history.size());
        for (ChatMessage message : history) {
            messages.add(switch (message.role()) {
                case USER -> new UserMessage(message.content());
                case ASSISTANT -> new AssistantMessage(message.content());
            });
        }
        return messages;
    }

}
