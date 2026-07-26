package com.powerlifting.orchestrator.chat.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.powerlifting.orchestrator.retrieval.RetrievedContext;
import com.powerlifting.orchestrator.retrieval.RetrievedDoc;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The excerpts block is the entire RAG payload, so its shape is behaviour. */
class RetrievedContextMessageTest {

    private static RetrievedDoc doc(String content) {
        return new RetrievedDoc(1, content, null, 0.5, "T", "A", "u", List.of());
    }

    @Test
    void noDocumentsStillSaysSoExplicitly() {
        // The system prompt promises excerpts "may" be attached; silence would
        // read as "not provided yet" and invite the model to wait for them.
        assertThat(Generator.buildRetrievedContextMessage(RetrievedContext.empty()))
                .isEqualTo("Retrieved training excerpts: (none found)");
    }

    @Test
    void nullContextIsTreatedAsNoDocuments() {
        assertThat(Generator.buildRetrievedContextMessage(null))
                .isEqualTo("Retrieved training excerpts: (none found)");
    }

    @Test
    void excerptsAreNumberedFromOneAndSeparated() {
        RetrievedContext retrieved = new RetrievedContext(
                List.of(doc("first"), doc("second")), "q", List.of());

        String message = Generator.buildRetrievedContextMessage(retrieved);

        assertThat(message).contains("Excerpt 1\nfirst")
                           .contains("Excerpt 2\nsecond")
                           .contains("\n\n---\n\n");
    }

    @Test
    void longExcerptsAreTruncated() {
        // Five chunks of unbounded text would blow the context window and the
        // bill; each excerpt is capped at 1400 chars.
        RetrievedContext retrieved = new RetrievedContext(
                List.of(doc("x".repeat(5000))), "q", List.of());

        String message = Generator.buildRetrievedContextMessage(retrieved);

        assertThat(message).hasSizeLessThan(1600);
        assertThat(message).doesNotContain("x".repeat(1401));
    }
}
