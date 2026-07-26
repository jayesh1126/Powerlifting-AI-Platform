package com.powerlifting.orchestrator.stream;

import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import tools.jackson.databind.ObjectMapper;

/**
 * Serializes runtime events as newline-delimited JSON onto the response body.
 *
 * <p>The flush per event is load-bearing, not defensive: without it the
 * servlet container buffers output and the gateway sees nothing until the
 * buffer fills or the response ends — which would turn a streaming answer into
 * a single delayed blob and defeat the whole contract.
 *
 * <p>Not thread-safe by design. One sink belongs to one request, written from
 * that request's own virtual thread.
 */
public final class NdjsonSink implements EventSink {

    private final OutputStream out;
    private final ObjectMapper mapper;

    public NdjsonSink(OutputStream out, ObjectMapper mapper) {
        this.out = out;
        this.mapper = mapper;
    }

    @Override
    public void emit(StreamEvent event) {
        try {
            out.write(mapper.writeValueAsBytes(event));
            out.write('\n');
            out.flush();
        } catch (IOException e) {
            // Almost always the client hanging up mid-stream. Unchecked so it
            // unwinds the runtime loop; the controller decides what to log.
            throw new UncheckedIOException(e);
        }
    }
}
