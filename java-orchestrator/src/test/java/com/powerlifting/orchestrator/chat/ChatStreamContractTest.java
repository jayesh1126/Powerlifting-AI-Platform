package com.powerlifting.orchestrator.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;

import com.powerlifting.orchestrator.chat.model.ChatStreamRequest;
import com.powerlifting.orchestrator.stream.EventSink;
import com.powerlifting.orchestrator.stream.StreamEvent;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

/**
 * The wire contract with the Next.js gateway, exercised over real HTTP so that
 * streaming, content type and the filter chain are all genuinely in play.
 *
 * <p>{@link ChatService} is mocked: this is a test of the HTTP boundary —
 * authentication, validation, NDJSON framing — not of the AI pipeline, and it
 * must never make a billable model call or depend on network availability.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "powerlifting.internal-api-key=test-key",
                "spring.ai.openai.api-key=test-openai-key"
        })
class ChatStreamContractTest {

    private static final String VALID_BODY = """
            {"user_id":"u1","chat_id":"c1",
             "messages":[{"role":"User","content":"how do I fix knee valgus?"}]}
            """;

    @LocalServerPort
    int port;

    @MockitoBean
    ChatService chatService;

    private RestClient client() {
        return RestClient.create("http://localhost:" + port);
    }

    /** Makes the mocked service emit a representative event sequence. */
    private void stubStreamedTurn() {
        Mockito.doAnswer(invocation -> {
            EventSink sink = invocation.getArgument(1);
            sink.emit(new StreamEvent.Token("Push "));
            sink.emit(new StreamEvent.Token("your knees out."));
            sink.emit(new StreamEvent.End());
            return null;
        }).when(chatService).streamTurn(any(ChatStreamRequest.class), any(EventSink.class));
    }

    @Test
    void healthIsServedByActuatorAndIsUnauthenticated() {
        String body = client().get().uri("/actuator/health").retrieve().body(String.class);

        assertThat(body).contains("\"status\":\"UP\"");
    }

    @Test
    void chatStreamRejectsAMissingApiKey() {
        HttpStatusCode status = client().post()
                .uri("/v1/chat/stream")
                .contentType(MediaType.APPLICATION_JSON)
                .body(VALID_BODY)
                .exchange((request, response) -> response.getStatusCode());

        assertThat(status.value()).isEqualTo(401);
        Mockito.verifyNoInteractions(chatService);
    }

    @Test
    void chatStreamRejectsAWrongApiKey() {
        HttpStatusCode status = client().post()
                .uri("/v1/chat/stream")
                .header("X-Internal-Api-Key", "not-the-key")
                .contentType(MediaType.APPLICATION_JSON)
                .body(VALID_BODY)
                .exchange((request, response) -> response.getStatusCode());

        assertThat(status.value()).isEqualTo(401);
        Mockito.verifyNoInteractions(chatService);
    }

    @Test
    void chatStreamEmitsOneJsonObjectPerLine() {
        stubStreamedTurn();

        String body = client().post()
                .uri("/v1/chat/stream")
                .header("X-Internal-Api-Key", "test-key")
                .contentType(MediaType.APPLICATION_JSON)
                .body(VALID_BODY)
                .retrieve()
                .body(String.class);

        assertThat(body).isNotNull();
        String[] lines = body.strip().split("\n");

        assertThat(lines).allSatisfy(line -> assertThat(line).startsWith("{\"type\":"));
        assertThat(lines[0]).isEqualTo("{\"type\":\"token\",\"text\":\"Push \"}");
        assertThat(lines[lines.length - 1]).isEqualTo("{\"type\":\"end\"}");
    }

    @Test
    void optionalFieldsMayBeOmitted() {
        stubStreamedTurn();

        // total_message_count, summary, user_context and request_context are all
        // absent here and must default rather than fail binding.
        HttpStatusCode status = client().post()
                .uri("/v1/chat/stream")
                .header("X-Internal-Api-Key", "test-key")
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"user_id\":\"u\",\"chat_id\":\"c\","
                        + "\"messages\":[{\"role\":\"User\",\"content\":\"hi\"}]}")
                .exchange((request, response) -> response.getStatusCode());

        assertThat(status.value()).isEqualTo(200);
    }

    @Test
    void anEmptyMessageWindowIsRejected() {
        HttpStatusCode status = client().post()
                .uri("/v1/chat/stream")
                .header("X-Internal-Api-Key", "test-key")
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"user_id\":\"u\",\"chat_id\":\"c\",\"messages\":[]}")
                .exchange((request, response) -> response.getStatusCode());

        assertThat(status.value()).isEqualTo(400);
        Mockito.verifyNoInteractions(chatService);
    }
}
