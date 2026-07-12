"""OpenPowerlifting analytics tools.

Port of the old app's tools.server.ts (get_lifter_history +
leaderboard_query). The model never writes SQL — it fills in typed
parameters and these tools run fixed, parameterized queries against the
read-only meet-results database (lifters / meets / results, see
infra/opl/init.sql at the repo root).

Safety: every connection is opened with default_transaction_read_only=on,
so even a bug here cannot write.
"""

import json
import logging
from typing import Literal

import asyncpg
from pydantic import BaseModel, Field

from app.config import get_settings
from app.tools.base import Tool

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def get_opl_pool() -> asyncpg.Pool | None:
    """Lazy connection pool. Returns None when OPL_DATABASE_URL is unset
    so the tools can report unavailability instead of crashing."""
    global _pool
    settings = get_settings()
    if not settings.opl_database_url:
        return None
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.opl_database_url,
            min_size=1,
            max_size=5,
            server_settings={"default_transaction_read_only": "on"},
        )
    return _pool


async def close_opl_pool() -> None:
    """Called from the app lifespan on shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _rows_to_json(rows: list[asyncpg.Record], limit_chars: int) -> str:
    payload = json.dumps([dict(r) for r in rows], default=str)
    if len(payload) > limit_chars:
        return json.dumps(
            {"error": "Result too large — narrow the query (fewer rows or more filters)."}
        )
    return payload


# ---------------------------------------------------------------------------
# Country normalization (trimmed port of normalizeCountry). The dataset
# stores UK lifters under their home nation, so "UK" fans out to a group.
# ---------------------------------------------------------------------------

UK_GROUP = ["UK", "England", "Scotland", "Wales", "N.Ireland"]
UK_ALIASES = {"uk", "united kingdom", "great britain", "britain", "gb", "gbr"}
COUNTRY_ALIASES = {
    "us": "USA",
    "usa": "USA",
    "united states": "USA",
    "america": "USA",
    "nz": "New Zealand",
    "uae": "UAE",
}


def normalize_country(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    normalized = raw.lower().replace(".", "").strip()
    if normalized in UK_ALIASES:
        return UK_GROUP
    if normalized in COUNTRY_ALIASES:
        return [COUNTRY_ALIASES[normalized]]
    # Dataset uses title-cased country names ("France", "South Africa").
    return [raw.strip().title()]


# ---------------------------------------------------------------------------
# Tool 1: lifter history
# ---------------------------------------------------------------------------


class LifterHistoryParams(BaseModel):
    name: str = Field(description="Lifter name, full or partial (case-insensitive)")


class GetLifterHistoryTool(Tool):
    name = "get_lifter_history"
    description = (
        "Fetch all recorded meet results for a lifter by (partial) name from the "
        "OpenPowerlifting dataset: every attempt (positive = good lift, negative = "
        "failed), bests, totals, DOTS/goodlift, equipment, event, ordered by date. "
        "Use for questions about a specific lifter's numbers, PRs, progression, or "
        "consistency. If several distinct lifters match, ask the user which one."
    )
    params_model = LifterHistoryParams

    async def execute(self, args: LifterHistoryParams) -> str:
        pool = await get_opl_pool()
        if pool is None:
            return json.dumps({"error": "OpenPowerlifting database is not configured."})

        q = """
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
          WHERE l.name ILIKE $1
          ORDER BY m.date ASC
          LIMIT 50;
        """
        rows = await pool.fetch(q, f"%{args.name}%")
        logger.info("get_lifter_history name=%r rows=%d", args.name, len(rows))
        return _rows_to_json(rows, get_settings().max_tool_result_chars)


# ---------------------------------------------------------------------------
# Tool 2: leaderboards
# ---------------------------------------------------------------------------


class LeaderboardParams(BaseModel):
    order_by: Literal["total", "dots", "wilks", "glossbrenner", "goodlift"] = Field(
        default="total", description="Ranking metric"
    )
    top_n: int = Field(default=10, ge=1, le=25)
    sex: Literal["M", "F"] | None = None
    tested: bool | None = Field(
        default=None,
        description="Drug-tested filter. Defaults to tested-only; pass false to include untested.",
    )
    equipment: Literal["Raw", "Wraps", "Single-ply"] | None = None
    event: Literal["SBD", "B", "S", "D", "SB", "BD", "SD"] | None = Field(
        default=None, description="Lift event, e.g. SBD = full power, B = bench-only"
    )
    country: str | None = None
    weightclass_kg: str | None = Field(
        default=None, description='IPF weight class, e.g. "83", "93", "84+"'
    )
    birthyearclass: str | None = Field(
        default=None, description='Age class, e.g. "19-23", "24-39"'
    )


class LeaderboardQueryTool(Tool):
    name = "leaderboard_query"
    description = (
        "Rank top lifters from the OpenPowerlifting dataset ('top N', 'best', "
        "'record holders', 'leaderboard'). Only include filters the user explicitly "
        "asked for — never invent sex/country/class filters."
    )
    params_model = LeaderboardParams

    async def execute(self, args: LeaderboardParams) -> str:
        pool = await get_opl_pool()
        if pool is None:
            return json.dumps({"error": "OpenPowerlifting database is not configured."})

        # order_by is validated against a Literal, so interpolating it is safe.
        conditions: list[str] = []
        values: list = []

        def bind(value) -> str:
            values.append(value)
            return f"${len(values)}"

        if args.sex:
            conditions.append(f"l.sex = {bind(args.sex)}")
        if args.tested is not False:
            conditions.append(f"r.tested = {bind('Yes')}")
        if args.equipment:
            conditions.append(f"r.equipment = {bind(args.equipment)}")
        if args.event:
            conditions.append(f"r.event = {bind(args.event)}")
        if args.weightclass_kg:
            conditions.append(f"r.weightclass_kg = {bind(args.weightclass_kg)}")
        if args.birthyearclass:
            conditions.append(f"r.birthyearclass = {bind(args.birthyearclass)}")
        countries = normalize_country(args.country)
        if countries:
            conditions.append(f"l.country = ANY({bind(countries)})")
        conditions.append(f"r.{args.order_by} IS NOT NULL")

        sql = f"""
          SELECT
            l.lifter_id, l.name, l.sex, l.country,
            r.birthyearclass, r.weightclass_kg,
            r.total, r.dots, r.wilks, r.glossbrenner, r.goodlift,
            r.equipment, r.tested, r.event,
            m.date, m.meet_name
          FROM results r
          JOIN lifters l USING (lifter_id)
          JOIN meets m USING (meet_id)
          WHERE {" AND ".join(conditions)}
          ORDER BY r.{args.order_by} DESC
          LIMIT {args.top_n};
        """
        rows = await pool.fetch(sql, *values)
        logger.info("leaderboard_query order_by=%s rows=%d", args.order_by, len(rows))
        return _rows_to_json(rows, get_settings().max_tool_result_chars)


OPL_TOOLS: list[Tool] = [GetLifterHistoryTool(), LeaderboardQueryTool()]
