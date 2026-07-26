# ---- Stage 1: build the bootJar ----
# Full JDK + Gradle only here; none of it ships in the final image.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app

# Copy the wrapper + build scripts FIRST, resolve dependencies, THEN copy source.
# Docker caches each layer: as long as build.gradle.kts is unchanged, the
# (slow) dependency download is reused and only recompilation runs on a code edit.
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
RUN ./gradlew dependencies --no-daemon || true

COPY src ./src
RUN ./gradlew bootJar --no-daemon

# ---- Stage 2: the runtime image ----
# JRE, not JDK: smaller, no compiler in production.
FROM eclipse-temurin:25-jre AS runtime
WORKDIR /app

# Run as a non-root user — if the process is ever compromised it has no root.
RUN useradd --system --no-create-home spring
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
USER spring

# Copy only the built jar out of the build stage.
COPY --from=build /app/build/libs/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
