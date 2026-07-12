-- One-shot initialization script for OpenPowerlifting data
-- Requires openipf-latest.csv in /import inside the Postgres container.
-- (Ported unchanged from the old app; consumed by app/tools/opl.py.)

BEGIN;

-- 1. Drop existing tables (respect dependencies)
DROP TABLE IF EXISTS results CASCADE;
DROP TABLE IF EXISTS meets CASCADE;
DROP TABLE IF EXISTS lifters CASCADE;
DROP TABLE IF EXISTS opl_raw CASCADE;

-- 2. Raw staging table (matches CSV EXACTLY — 43 columns)
CREATE TABLE opl_raw (
    Name TEXT,
    Sex TEXT,
    Event TEXT,
    Equipment TEXT,
    Age REAL,
    AgeClass TEXT,
    BirthYearClass TEXT,
    Division TEXT,
    BodyweightKg REAL,
    WeightClassKg TEXT,
    Squat1Kg REAL,
    Squat2Kg REAL,
    Squat3Kg REAL,
    Squat4Kg REAL,
    Best3SquatKg REAL,
    Bench1Kg REAL,
    Bench2Kg REAL,
    Bench3Kg REAL,
    Bench4Kg REAL,
    Best3BenchKg REAL,
    Deadlift1Kg REAL,
    Deadlift2Kg REAL,
    Deadlift3Kg REAL,
    Deadlift4Kg REAL,
    Best3DeadliftKg REAL,
    TotalKg REAL,
    Place TEXT,
    Dots REAL,
    Wilks REAL,
    Glossbrenner REAL,
    Goodlift REAL,
    Tested TEXT,
    Country TEXT,
    State TEXT,
    Federation TEXT,
    ParentFederation TEXT,
    Date DATE,
    MeetCountry TEXT,
    MeetState TEXT,
    MeetTown TEXT,
    MeetName TEXT,
    Sanctioned TEXT
);

-- 3. Load raw CSV
COPY opl_raw
FROM '/import/openipf-latest.csv'
CSV HEADER;

-- 4. Normalized tables
CREATE TABLE lifters (
    lifter_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sex TEXT,
    country TEXT,
    state TEXT
);

CREATE TABLE meets (
    meet_id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    meet_name TEXT NOT NULL,
    meet_country TEXT,
    meet_state TEXT,
    meet_town TEXT
);

CREATE TABLE results (
    result_id SERIAL PRIMARY KEY,
    lifter_id INT NOT NULL REFERENCES lifters(lifter_id),
    meet_id INT NOT NULL REFERENCES meets(meet_id),

    -- lifter metadata for filters
    sex TEXT,
    country TEXT,
    state TEXT,

    -- event data
    federation TEXT,
    parent_federation TEXT,
    event TEXT,
    equipment TEXT,
    tested TEXT,

    -- age data
    age REAL,
    ageclass TEXT,
    birthyearclass TEXT,
    division TEXT,

    -- performance data
    bodyweight_kg REAL,
    weightclass_kg TEXT,

    squat1 REAL,
    squat2 REAL,
    squat3 REAL,
    squat4 REAL,

    bench1 REAL,
    bench2 REAL,
    bench3 REAL,
    bench4 REAL,

    deadlift1 REAL,
    deadlift2 REAL,
    deadlift3 REAL,
    deadlift4 REAL,

    best3squat REAL,
    best3bench REAL,
    best3deadlift REAL,

    total REAL,
    dots REAL,
    wilks REAL,
    glossbrenner REAL,
    goodlift REAL,

    place TEXT
);

-- 5. Populate lifters and meets (using Name as unique lifter identifier)
INSERT INTO lifters (name, sex, country, state)
SELECT
    Name,
    MAX(Sex) AS Sex,
    MAX(Country) FILTER (WHERE Country IS NOT NULL) AS Country,
    MAX(State)   FILTER (WHERE State   IS NOT NULL) AS State
FROM opl_raw
GROUP BY Name;

INSERT INTO meets (date, meet_name, meet_country, meet_state, meet_town)
SELECT DISTINCT Date, MeetName, MeetCountry, MeetState, MeetTown
FROM opl_raw;

-- 6. Populate results (JOIN on Name — unique natural key)
INSERT INTO results (
    lifter_id, meet_id,
    sex, country, state,
    federation, parent_federation,
    event, equipment, tested,
    age, ageclass, birthyearclass, division,
    bodyweight_kg, weightclass_kg,

    squat1, squat2, squat3, squat4,
    bench1, bench2, bench3, bench4,
    deadlift1, deadlift2, deadlift3, deadlift4,

    best3squat, best3bench, best3deadlift,

    total, dots, wilks, glossbrenner, goodlift,
    place
)
SELECT
    l.lifter_id,
    m.meet_id,

    r.Sex,
    r.Country,
    r.State,

    r.Federation,
    r.ParentFederation,
    r.Event,
    r.Equipment,
    r.Tested,

    r.Age,
    r.AgeClass,
    r.BirthYearClass,
    r.Division,

    r.BodyweightKg,
    r.WeightClassKg,

    r.Squat1Kg, r.Squat2Kg, r.Squat3Kg, r.Squat4Kg,
    r.Bench1Kg, r.Bench2Kg, r.Bench3Kg, r.Bench4Kg,
    r.Deadlift1Kg, r.Deadlift2Kg, r.Deadlift3Kg, r.Deadlift4Kg,

    r.Best3SquatKg,
    r.Best3BenchKg,
    r.Best3DeadliftKg,

    r.TotalKg,
    r.Dots,
    r.Wilks,
    r.Glossbrenner,
    r.Goodlift,
    r.Place
FROM opl_raw r
JOIN lifters l USING (name)
JOIN meets m ON m.date = r.Date AND m.meet_name = r.MeetName;

-- 7. Indexes
CREATE INDEX idx_lifters_name ON lifters(name);
CREATE INDEX idx_results_lifter ON results(lifter_id);
CREATE INDEX idx_results_meet ON results(meet_id);

CREATE INDEX idx_results_country ON results(country);
CREATE INDEX idx_results_sex ON results(sex);
CREATE INDEX idx_results_equipment ON results(equipment);
CREATE INDEX idx_results_tested ON results(tested);
CREATE INDEX idx_results_federation ON results(federation);
CREATE INDEX idx_results_event ON results(event);
CREATE INDEX idx_results_ageclass ON results(ageclass);

CREATE INDEX idx_results_weightclass ON results(weightclass_kg);
CREATE INDEX idx_results_total ON results(total);
CREATE INDEX idx_results_dots ON results(dots);

CREATE INDEX idx_meets_date ON meets(date);

COMMIT;
