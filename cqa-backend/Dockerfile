# Stage 1: Build the Spring Boot application using Gradle & JDK 21
FROM gradle:8.10-jdk21-alpine AS builder
WORKDIR /app

# Cache dependencies
COPY build.gradle.kts settings.gradle.kts ./
RUN gradle dependencies --no-daemon || true

# Copy source code and build production jar
COPY src ./src
RUN gradle bootJar --no-daemon -x test

# Stage 2: Minimal Production JRE Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Run as non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder /app/build/libs/*-1.0.0.jar app.jar

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom", "-jar", "app.jar"]
