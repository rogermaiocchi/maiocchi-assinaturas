FROM maven:3.9.11-eclipse-temurin-21-alpine AS build
WORKDIR /src
COPY services/pades-provider/pom.xml ./pom.xml
RUN mvn -q -DskipTests dependency:go-offline
COPY services/pades-provider/src ./src
RUN mvn -q package

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S pades && adduser -S -G pades -u 10001 pades
COPY --from=build /src/target/pades-provider-*.jar /app/provider.jar
USER 10001:10001
EXPOSE 3500
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/provider.jar"]
