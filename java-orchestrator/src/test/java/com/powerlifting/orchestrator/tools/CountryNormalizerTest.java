package com.powerlifting.orchestrator.tools;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CountryNormalizerTest {

    @ParameterizedTest
    @ValueSource(strings = {"UK", "uk", "United Kingdom", "Great Britain", "GB", "gbr", "britain"})
    void britishAliasesFanOutToTheHomeNations(String alias) {
        // The dataset files UK lifters under England/Scotland/Wales/N.Ireland,
        // so matching on "UK" alone would silently return nothing.
        assertThat(CountryNormalizer.normalize(alias))
                .containsExactlyElementsOf(CountryNormalizer.UK_GROUP);
    }

    @ParameterizedTest
    @ValueSource(strings = {"us", "USA", "united states", "America"})
    void americanAliasesCollapseToUsa(String alias) {
        assertThat(CountryNormalizer.normalize(alias)).containsExactly("USA");
    }

    @Test
    void unknownCountriesAreTitleCasedToMatchTheDataset() {
        assertThat(CountryNormalizer.normalize("south africa")).containsExactly("South Africa");
        assertThat(CountryNormalizer.normalize("FRANCE")).containsExactly("France");
    }

    @Test
    void dotsAreIgnoredWhenMatchingAliases() {
        assertThat(CountryNormalizer.normalize("U.K.")).containsExactlyElementsOf(
                CountryNormalizer.UK_GROUP);
    }

    @Test
    void noCountryMeansNoFilter() {
        // Returning an empty list instead of null would add an impossible
        // WHERE clause and quietly return zero rows.
        assertThat(CountryNormalizer.normalize(null)).isNull();
        assertThat(CountryNormalizer.normalize("   ")).isNull();
    }
}
