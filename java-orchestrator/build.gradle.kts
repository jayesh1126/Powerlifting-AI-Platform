plugins {
	java
	id("org.springframework.boot") version "4.1.0"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "com.powerlifting"
version = "0.0.1-SNAPSHOT"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(25)
	}
}

repositories {
	mavenCentral()
}

extra["springAiVersion"] = "2.0.0"

dependencies {
	implementation("org.springframework.boot:spring-boot-starter-actuator")
	implementation("org.springframework.boot:spring-boot-starter-webmvc")
	// Bean Validation at the wire boundary (e.g. messages must be non-empty).
	implementation("org.springframework.boot:spring-boot-starter-validation")
	// JdbcClient + HikariCP for the read-only OpenPowerlifting queries. The
	// DataSource is autoconfigured from spring.datasource.* (URL, credentials in
	// the active profile; pool settings in application.properties).
	implementation("org.springframework.boot:spring-boot-starter-jdbc")
	// OpenAPI spec + Swagger UI. The 3.0.x line targets Spring Boot 4 / Jackson 3;
	// 2.x targets Boot 3 and fails at runtime here.
	implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:3.0.3")
	// Autoconfigures ChatClient.Builder and EmbeddingModel from spring.ai.openai.*.
	// The unused capabilities (image, audio, moderation) are switched off in
	// application.properties: each one builds its own HTTP client at startup and
	// nothing here calls them.
	implementation("org.springframework.ai:spring-ai-starter-model-openai")
	compileOnly("org.projectlombok:lombok")
	// spring-boot-devtools removed deliberately. It silently overrides explicit
	// configuration (it forces server.error.include-stacktrace=ALWAYS, which put
	// internal stack traces in 4xx response bodies even after we set "never"),
	// and its auto-restart makes "is the running process the code I just wrote?"
	// ambiguous. Being developmentOnly it never reaches the production image, so
	// it buys no parity — only a dev/prod behaviour split. Re-add if the restart
	// speed is worth it, knowing the property override comes with it.
	runtimeOnly("io.micrometer:micrometer-registry-prometheus")
	implementation("org.postgresql:postgresql")
	annotationProcessor("org.projectlombok:lombok")
	testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
	testCompileOnly("org.projectlombok:lombok")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
	testAnnotationProcessor("org.projectlombok:lombok")
}

dependencyManagement {
	imports {
		mavenBom("org.springframework.ai:spring-ai-bom:${property("springAiVersion")}")
	}
}

tasks.withType<Test> {
	useJUnitPlatform()
}
