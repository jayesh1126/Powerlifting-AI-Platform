package com.powerlifting.orchestrator.chat.runtime;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.ai.chat.messages.AssistantMessage.ToolCall;
import org.springframework.ai.chat.model.ChatResponse;

/**
 * Reassembles tool calls from a streamed response.
 *
 * <p>Providers deliver tool calls as fragments — the id and name arrive first,
 * then the JSON arguments in pieces. Some client libraries merge those
 * fragments before handing them over and some do not, and the two produce
 * opposite requirements: merged responses must be <em>replaced</em> (each one
 * already contains everything so far) while raw fragments must be
 * <em>appended</em>.
 *
 * <p>Rather than depend on which behaviour Spring AI happens to have, the
 * prefix test below is correct under both: if the incoming arguments start with
 * what we already hold, the provider is sending cumulative values and we
 * replace; otherwise it is sending a fragment and we append. Both collapse to
 * the right answer for the first fragment, where the held value is empty.
 */
final class ToolCallAccumulator {

    private final Map<String, Accumulated> byId = new LinkedHashMap<>();
    private String lastId;

    private static final class Accumulated {
        private String name = "";
        private String type = "function";
        private final StringBuilder arguments = new StringBuilder();
    }

    void observe(ChatResponse response) {
        if (response == null || response.getResult() == null
                || response.getResult().getOutput() == null) {
            return;
        }
        List<ToolCall> calls = response.getResult().getOutput().getToolCalls();
        if (calls == null) {
            return;
        }
        for (ToolCall call : calls) {
            // A fragment after the first may carry no id; it belongs to the
            // call the previous fragment opened.
            String id = (call.id() != null && !call.id().isBlank()) ? call.id() : lastId;
            if (id == null) {
                continue;
            }
            lastId = id;

            Accumulated accumulated = byId.computeIfAbsent(id, key -> new Accumulated());
            if (call.name() != null && !call.name().isBlank()) {
                accumulated.name = call.name();
            }
            if (call.type() != null && !call.type().isBlank()) {
                accumulated.type = call.type();
            }
            String incoming = call.arguments();
            if (incoming != null && !incoming.isEmpty()) {
                String held = accumulated.arguments.toString();
                if (incoming.startsWith(held)) {
                    accumulated.arguments.setLength(0);
                    accumulated.arguments.append(incoming);
                } else {
                    accumulated.arguments.append(incoming);
                }
            }
        }
    }

    boolean isEmpty() {
        return byId.isEmpty();
    }

    List<ToolCall> toToolCalls() {
        List<ToolCall> calls = new ArrayList<>(byId.size());
        byId.forEach((id, accumulated) -> calls.add(
                new ToolCall(id, accumulated.type, accumulated.name,
                        accumulated.arguments.toString())));
        return calls;
    }
}
