import { useEffect, useState } from "react";

function activityFromContributions(response) {
  const contributions = [...response.contributions].sort((a, b) => a.date.localeCompare(b.date));
  const countByDate = new Map(contributions.map((day) => [day.date, day]));
  const first = new Date(`${contributions[0].date}T00:00:00Z`);
  const last = new Date(`${contributions.at(-1).date}T00:00:00Z`);
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(last);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  const weekCount = Math.ceil((end - start + 1) / (7 * 24 * 60 * 60 * 1000));

  const weeks = [];
  const dayLabels = [];
  const weekDates = [];
  for (let week = 0; week < weekCount; week += 1) {
    const levels = [];
    const days = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + week * 7 + dayIndex);
      const key = date.toISOString().slice(0, 10);
      const contribution = countByDate.get(key);
      levels.push(contribution ? Math.max(0, Math.min(4, Number(contribution.level))) : 0);
      days.push(contribution ? `${key}: ${contribution.count} contributions` : `${key}: no contributions`);
    }
    weeks.push(levels);
    dayLabels.push(days);
    const weekDate = new Date(start);
    weekDate.setUTCDate(start.getUTCDate() + week * 7);
    weekDates.push(weekDate);
  }

  const months = [];
  let previousMonth = -1;
  weekDates.forEach((date, weekIndex) => {
    const month = date.getUTCMonth();
    if (month !== previousMonth) {
      months.push({
        label: date.toLocaleString(undefined, { month: "short", timeZone: "UTC" }),
        weekIndex,
      });
      previousMonth = month;
    }
  });

  const total = Object.values(response.total || {}).reduce((sum, count) => sum + Number(count || 0), 0);
  return {
    title: "GitHub contributions",
    summary: `${total.toLocaleString()} contributions in the last year`,
    rangeLabel: "Last year",
    months,
    weekdayLabels: ["Sun", "Tue", "Thu"],
    legend: { less: "Less", more: "More" },
    weeks,
    dayLabels,
  };
}

export function useGithubProfile(username) {
  const [state, setState] = useState({ profile: null, activity: null, loading: false, error: "", activityError: "" });

  useEffect(() => {
    if (!username) {
      setState({ profile: null, activity: null, loading: false, error: "", activityError: "" });
      return undefined;
    }

    const controller = new AbortController();
    setState({ profile: null, activity: null, loading: true, error: "", activityError: "" });
    const encodedUsername = encodeURIComponent(username);

    async function load() {
      try {
        const [profileResult, contributionResult] = await Promise.allSettled([
          fetch(`https://api.github.com/users/${encodedUsername}`, {
            headers: { Accept: "application/vnd.github+json" },
            signal: controller.signal,
          }),
          fetch(`https://github-contributions-api.jogruber.de/v4/${encodedUsername}?y=last`, {
            signal: controller.signal,
          }),
        ]);

        if (profileResult.status === "rejected") throw profileResult.reason;
        const profileResponse = profileResult.value;
        if (!profileResponse.ok) {
          throw new Error(profileResponse.status === 404 ? "GitHub user not found." : "Could not load the public GitHub profile.");
        }
        const profile = await profileResponse.json();
        let activity = null;
        let activityError = "";
        try {
          if (contributionResult.status === "rejected") throw contributionResult.reason;
          if (!contributionResult.value.ok) throw new Error("The contribution service is unavailable.");
          const contributionData = await contributionResult.value.json();
          if (!Array.isArray(contributionData.contributions) || contributionData.contributions.length === 0) {
            throw new Error("No contribution calendar was returned for this profile.");
          }
          activity = activityFromContributions(contributionData);
        } catch (calendarError) {
          if (calendarError.name === "AbortError") throw calendarError;
          activityError = "Could not load the full-year contribution calendar. Try refreshing the page.";
        }
        setState({ profile, activity, loading: false, error: "", activityError });
      } catch (error) {
        if (error.name !== "AbortError") setState({ profile: null, activity: null, loading: false, error: error.message, activityError: "" });
      }
    }

    load();
    return () => controller.abort();
  }, [username]);

  return state;
}
