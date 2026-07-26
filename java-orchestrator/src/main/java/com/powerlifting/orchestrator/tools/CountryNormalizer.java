package com.powerlifting.orchestrator.tools;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Maps user-supplied country names and abbreviations onto the values the
 * dataset actually stores.
 *
 * <p>The dataset stores UK lifters under their home nation, so "UK" has to fan
 * out to a group or a query for British lifters silently returns nothing.
 */
public final class CountryNormalizer {

    static final List<String> UK_GROUP = List.of("UK", "England", "Scotland", "Wales", "N.Ireland");

    private static final Set<String> UK_ALIASES =
            Set.of("uk", "united kingdom", "great britain", "britain", "gb", "gbr");

    private static final Map<String, String> COUNTRY_ALIASES = Map.of(
            "us", "USA",
            "usa", "USA",
            "united states", "USA",
            "america", "USA",
            "nz", "New Zealand",
            "uae", "UAE");

    private CountryNormalizer() {
    }

    /** @return the country values to match, or null when no filter applies. */
    public static List<String> normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String normalized = raw.toLowerCase(Locale.ROOT).replace(".", "").strip();
        if (UK_ALIASES.contains(normalized)) {
            return UK_GROUP;
        }
        String alias = COUNTRY_ALIASES.get(normalized);
        if (alias != null) {
            return List.of(alias);
        }
        // The dataset uses title-cased names ("France", "South Africa").
        return List.of(titleCase(raw.strip()));
    }

    private static String titleCase(String value) {
        StringBuilder out = new StringBuilder(value.length());
        boolean atWordStart = true;
        for (char c : value.toCharArray()) {
            if (Character.isWhitespace(c)) {
                atWordStart = true;
                out.append(c);
            } else if (atWordStart) {
                out.append(Character.toTitleCase(c));
                atWordStart = false;
            } else {
                out.append(Character.toLowerCase(c));
            }
        }
        return out.toString();
    }
}
