package com.flashsale.backend.web;

import java.time.Instant;
import java.util.Map;

import javax.sql.DataSource;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Temporary scaffolding endpoint. It exists only to prove the dev environment
 * is wired up: the frontend can reach the backend, and the backend can reach
 * Postgres. It will be deleted once real controllers exist.
 */
@RestController
@RequestMapping("/api")
public class PingController {

    private final DataSource dataSource;

    public PingController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        return Map.of(
                "service", "flash-sale-backend",
                "status", "up",
                "database", describeDatabase(),
                "timestamp", Instant.now().toString());
    }

    private String describeDatabase() {
        try (var connection = dataSource.getConnection()) {
            var metaData = connection.getMetaData();
            return "connected: " + metaData.getDatabaseProductName()
                    + " " + metaData.getDatabaseProductVersion();
        } catch (Exception e) {
            return "unreachable: " + e.getMessage();
        }
    }
}
