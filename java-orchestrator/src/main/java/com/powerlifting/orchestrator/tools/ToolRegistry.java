package com.powerlifting.orchestrator.tools;

import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.support.ToolCallbacks;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.stereotype.Component;

/**
 * The capabilities the generator may expose to the model.
 *
 * <p>The tool schemas the model sees are derived by Spring AI from the
 * {@code @Tool} / {@code @ToolParam} annotations on {@link OplTools}, so the
 * schema and the method signature that validates the call come from one
 * declaration and cannot drift apart.
 */
@Component
@Slf4j
public class ToolRegistry {

    private final List<ToolCallback> oplTools;

    public ToolRegistry(OplTools oplTools) {
        this.oplTools = List.of(ToolCallbacks.from(oplTools));
        log.info("registered {} competition data tools: {}", this.oplTools.size(),
                this.oplTools.stream().map(t -> t.getToolDefinition().name()).toList());
    }

    /** Bound only when the planner grants the lifter-data capability. */
    public List<ToolCallback> oplTools() {
        return oplTools;
    }
}
