package com.powerlifting.orchestrator.stream;

/**
 * The channel a runtime stage uses to push a user-visible event onto the
 * response stream.
 *
 * <p>Passed explicitly to the stages that need it rather than resolved from
 * ambient or thread-local state, so a stage's ability to emit output is visible
 * in its signature and cannot be reached for by surprise elsewhere. The sole
 * production implementation is {@link NdjsonSink}; tests supply a lambda.
 */
@FunctionalInterface
public interface EventSink {

    void emit(StreamEvent event);
}
