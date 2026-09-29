# Agentic Business Network: API + web client in one image.
# Build context is the repository root (the web client lives there too).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Agentic.Api/Agentic.Api.csproj src/Agentic.Api/
RUN dotnet restore src/Agentic.Api/Agentic.Api.csproj
COPY src/Agentic.Api/ src/Agentic.Api/
RUN dotnet publish src/Agentic.Api/Agentic.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# Only the web client's public files, never the rest of the repository
COPY index.html /app/web/index.html
COPY css /app/web/css
COPY js /app/web/js
RUN mkdir -p /data/keys && chown -R app:app /data
ENV ASPNETCORE_URLS=http://+:8080 \
    Frontend__Root=/app/web \
    ConnectionStrings__Default="Data Source=/data/agentic.db" \
    DATA_PROTECTION_PATH=/data/keys
VOLUME /data
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Agentic.Api.dll"]
