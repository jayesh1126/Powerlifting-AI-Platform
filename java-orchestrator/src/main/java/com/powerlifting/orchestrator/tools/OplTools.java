package com.powerlifting.orchestrator.tools;

import com.powerlifting.orchestrator.config.OrchestratorProperties;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import tools.jackson.databind.ObjectMapper;

/**
 * OpenPowerlifting analytics tools, exposed to the model as callable functions.
 *
 * <p>The model never writes SQL. It fills in typed parameters and these methods
 * run fixed, parameterized queries against the read-only meet-results database
 * (schema in infra/opl/init.sql). Enum-typed parameters mean an invalid
 * {@code order_by} or {@code equipment} cannot reach the query at all, which is
 * what makes interpolating {@code orderBy} into the SQL safe.
 *
 * <p>Every method returns a JSON string, and an object with an {@code "error"}
 * key means the call failed. Errors are fed back to the model so it can retry
 * or answer without the data, rather than killing the request.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class OplTools {

    private static final int LIFTER_HISTORY_LIMIT = 50;

    /** Ranking metrics. A closed set, so it is safe to interpolate. */
    public enum OrderBy { total, dots, wilks, glossbrenner, goodlift }

    public enum Sex { M, F }

    public enum Equipment { Raw, Wraps, Single_ply }

    /** SBD = full power, B = bench-only, and so on. */
    public enum Event { SBD, B, S, D, SB, BD, SD }

    private final JdbcClient jdbcClient;
    private final OrchestratorProperties properties;
    private final ObjectMapper mapper;

    @Tool(name = "get_lifter_history", description = """
            Fetch all recorded meet results for a lifter by (partial) name from the \
            OpenPowerlifting dataset: every attempt (positive = good lift, negative = \
            failed), bests, totals, DOTS/goodlift, equipment, event, ordered by date. \
            Use for questions about a specific lifter's numbers, PRs, progression, or \
            consistency. If several distinct lifters match, ask the user which one.""")
    public String getLifterHistory(
            @ToolParam(description = "Lifter name, full or partial (case-insensitive)")
            String name) {

        String sql = """
                SELECT
                  l.lifter_id, l.name, l.sex, l.country,
                  m.date, m.meet_name, m.meet_country,
                  r.total, r.dots, r.goodlift,
                  r.squat1, r.squat2, r.squat3, r.best3squat,
                  r.bench1, r.bench2, r.bench3, r.best3bench,
                  r.deadlift1, r.deadlift2, r.deadlift3, r.best3deadlift,
                  r.bodyweight_kg, r.weightclass_kg,
                  r.equipment, r.event
                FROM lifters l
                JOIN results r USING (lifter_id)
                JOIN meets m USING (meet_id)
                WHERE l.name ILIKE ?
                ORDER BY m.date ASC
                LIMIT %d
                """.formatted(LIFTER_HISTORY_LIMIT);

        try {
            List<Map<String, Object>> rows = jdbcClient
                    .sql(sql)
                    .param("%" + name + "%")
                    .query()
                    .listOfRows();
            // The name is user content — DEBUG only.
            log.debug("get_lifter_history name={}", name);
            log.info("get_lifter_history rows={}", rows.size());
            return toJsonWithSizeCap(rows);
        } catch (Exception e) {
            log.warn("get_lifter_history failed: {}", e.toString());
            return error("Tool get_lifter_history failed. "
                    + "Try different arguments or answer without it.");
        }
    }

    @Tool(name = "leaderboard_query", description = """
            Rank top lifters from the OpenPowerlifting dataset ('top N', 'best', \
            'record holders', 'leaderboard'). Only include filters the user explicitly \
            asked for — never invent sex/country/class filters.""")
    public String leaderboardQuery(
            @ToolParam(required = false, description = "Ranking metric; defaults to total")
            OrderBy orderBy,
            @ToolParam(required = false, description = "How many lifters to return, 1-25 (default 10)")
            Integer topN,
            @ToolParam(required = false, description = "Filter by sex")
            Sex sex,
            @ToolParam(required = false, description =
                    "Drug-tested filter. Defaults to tested-only; pass false to include untested.")
            Boolean tested,
            @ToolParam(required = false, description = "Equipment category")
            Equipment equipment,
            @ToolParam(required = false, description = "Lift event, e.g. SBD = full power, B = bench-only")
            Event event,
            @ToolParam(required = false, description = "Country name or common abbreviation")
            String country,
            @ToolParam(required = false, description = "IPF weight class, e.g. \"83\", \"93\", \"84+\"")
            String weightclassKg,
            @ToolParam(required = false, description = "Age class, e.g. \"19-23\", \"24-39\"")
            String birthyearclass) {

        OrderBy metric = orderBy != null ? orderBy : OrderBy.total;
        int limit = Math.clamp(topN != null ? topN : 10, 1, 25);

        List<String> conditions = new ArrayList<>();
        List<Object> values = new ArrayList<>();

        if (sex != null) {
            conditions.add("l.sex = ?");
            values.add(sex.name());
        }
        // Tested-only unless explicitly asked otherwise.
        if (!Boolean.FALSE.equals(tested)) {
            conditions.add("r.tested = ?");
            values.add("Yes");
        }
        if (equipment != null) {
            conditions.add("r.equipment = ?");
            // The enum constant cannot contain a hyphen; the dataset value does.
            values.add(equipment.name().replace('_', '-'));
        }
        if (event != null) {
            conditions.add("r.event = ?");
            values.add(event.name());
        }
        if (StringUtils.hasText(weightclassKg)) {
            conditions.add("r.weightclass_kg = ?");
            values.add(weightclassKg);
        }
        if (StringUtils.hasText(birthyearclass)) {
            conditions.add("r.birthyearclass = ?");
            values.add(birthyearclass);
        }
        List<String> countries = CountryNormalizer.normalize(country);
        if (countries != null) {
            conditions.add("l.country = ANY(?)");
            values.add(countries.toArray(String[]::new));
        }
        conditions.add("r." + metric.name() + " IS NOT NULL");

        String sql = """
                SELECT
                  l.lifter_id, l.name, l.sex, l.country,
                  r.birthyearclass, r.weightclass_kg,
                  r.total, r.dots, r.wilks, r.glossbrenner, r.goodlift,
                  r.equipment, r.tested, r.event,
                  m.date, m.meet_name
                FROM results r
                JOIN lifters l USING (lifter_id)
                JOIN meets m USING (meet_id)
                WHERE %s
                ORDER BY r.%s DESC
                LIMIT %d
                """.formatted(String.join(" AND ", conditions), metric.name(), limit);

        try {
            List<Map<String, Object>> rows = jdbcClient
                    .sql(sql)
                    .params(values)
                    .query()
                    .listOfRows();
            log.info("leaderboard_query order_by={} rows={}", metric, rows.size());
            return toJsonWithSizeCap(rows);
        } catch (Exception e) {
            log.warn("leaderboard_query failed: {}", e.toString());
            return error("Tool leaderboard_query failed. "
                    + "Try different arguments or answer without it.");
        }
    }

    /**
     * Oversized results are refused rather than truncated: a silently cut-off
     * row set would let the model draw confident conclusions from partial data.
     */
    private String toJsonWithSizeCap(List<Map<String, Object>> rows) {
        String payload = mapper.writeValueAsString(rows);
        if (payload.length() > properties.runtime().maxToolResultChars()) {
            return error("Result too large — narrow the query (fewer rows or more filters).");
        }
        return payload;
    }

    private String error(String message) {
        return mapper.writeValueAsString(Map.of("error", message));
    }
}
