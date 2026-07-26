package com.powerlifting.orchestrator.chat;

import com.powerlifting.orchestrator.chat.model.ChatStreamRequest;
import com.powerlifting.orchestrator.chat.runtime.ContextBuilder;
import com.powerlifting.orchestrator.chat.runtime.ExecutionPlan;
import com.powerlifting.orchestrator.chat.runtime.Generator;
import com.powerlifting.orchestrator.chat.runtime.Planner;
import com.powerlifting.orchestrator.chat.runtime.RuntimeContext;
import com.powerlifting.orchestrator.chat.runtime.Summarizer;
import com.powerlifting.orchestrator.chat.runtime.Verifier;
import com.powerlifting.orchestrator.observability.Instrumentation;
import com.powerlifting.orchestrator.observability.RequestMetrics;
import com.powerlifting.orchestrator.retrieval.CanonicalTopics;
import com.powerlifting.orchestrator.retrieval.KnowledgeRetrievalService;
import com.powerlifting.orchestrator.retrieval.RetrievedContext;
import com.powerlifting.orchestrator.stream.EventSink;
import com.powerlifting.orchestrator.stream.StreamEvent;
import java.io.UncheckedIOException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Orchestrates one chat turn: build context, plan, retrieve, generate, verify,
 * summarise, report.
 *
 * <p>The stages are collaborating components, each independently testable; this
 * service owns only the order they run in, the conditions between them, and the
 * shape of the event stream that comes out. Nothing here knows how to talk to a
 * model.
 *
 * <p>Retrieval and the tool loop deliberately are <em>not</em> Spring AI
 * advisors — both do blocking I/O, and advisor hooks execute on
 * {@code boundedElastic} rather than the request's virtual thread. See
 * {@link KnowledgeRetrievalService} and {@link Generator}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final ContextBuilder contextBuilder;
    private final Planner planner;
    private final KnowledgeRetrievalService retrieval;
    private final Generator generator;
    private final Verifier verifier;
    private final Summarizer summarizer;
    private final Instrumentation instrumentation;

    /**
     * Streams one turn into {@code sink}. Never throws: a failure is reported
     * to the caller as an {@code error} event, because by then the user may
     * already have received part of an answer.
     */
    public void streamTurn(ChatStreamRequest request, EventSink sink) {
        RequestMetrics metrics = new RequestMetrics(request.userId(), request.chatId());
        String outcome = Instrumentation.OUTCOME_OK;

        try {
            RuntimeContext ctx = contextBuilder.build(request);

            ExecutionPlan plan = metrics.time("planner", () -> planner.plan(ctx));
            metrics.setPlan(plan.toMap());

            RetrievedContext retrieved = retrieve(ctx, plan, metrics);

            String answer = metrics.time("generation",
                    () -> generator.generate(ctx, plan, retrieved, metrics, sink));

            emitCitations(retrieved, sink);

            metrics.setVerifierIssues(
                    verifier.verify(ctx, plan, answer, retrieved.documents().size(), metrics));

            refreshSummary(ctx, answer, metrics, sink);

            sink.emit(new StreamEvent.Metrics(metrics.toMap()));
            sink.emit(new StreamEvent.End());
        } catch (UncheckedIOException e) {
            // The client hung up mid-stream, so a write failed. Expected, not an
            // error: there is nothing left to write an `error` event to, and it
            // stays outcome=ok so it never inflates the error rate.
            log.info("client disconnected mid-stream chat={}", request.chatId());
        } catch (Exception e) {
            outcome = Instrumentation.OUTCOME_ERROR;
            log.error("chat turn failed chat={}", request.chatId(), e);
            metrics.setVerifierIssues(List.of(Verifier.RUNTIME_ERROR));
            sink.emit(new StreamEvent.Error("The AI runtime failed to produce a response."));
        } finally {
            metrics.log();
            instrumentation.recordRequest(metrics, outcome);
        }
    }

    /**
     * Retrieval runs only when planned. Program design always pulls the
     * programming-theory topics in as well, so a program answer is grounded in
     * periodisation and fatigue-management material even when the user's words
     * never mention them.
     */
    private RetrievedContext retrieve(RuntimeContext ctx, ExecutionPlan plan,
                                      RequestMetrics metrics) {
        if (!plan.retrieve() && !plan.programDesign()) {
            return RetrievedContext.empty();
        }
        RetrievedContext retrieved = metrics.time("retrieval", () -> retrieval.retrieve(
                ctx.query(),
                plan.programDesign() ? CanonicalTopics.DEFAULT_PROGRAM_TOPICS : List.of()));
        metrics.setDocsRetrieved(retrieved.documents().size());
        return retrieved;
    }

    /** After the answer, so sources appear beneath the text they support. */
    private void emitCitations(RetrievedContext retrieved, EventSink sink) {
        if (retrieved.isEmpty()) {
            return;
        }
        sink.emit(new StreamEvent.Citations(retrieved.documents().stream()
                .map(doc -> new StreamEvent.Citation(
                        doc.id(), doc.similarity(), doc.hybridScore(), doc.toCitationMetadata()))
                .toList()));
    }

    private void refreshSummary(RuntimeContext ctx, String answer, RequestMetrics metrics,
                                EventSink sink) {
        if (!ctx.shouldUpdateSummary() || answer.isBlank()) {
            return;
        }
        String summary = metrics.time("summary", () -> summarizer.summarize(ctx, answer));
        if (summary != null) {
            sink.emit(new StreamEvent.Summary(summary));
        }
    }
}
