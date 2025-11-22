import { useEffect, useState } from "react";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";

export function FamilyNewsPage() {
  const [membership, setMembership] =
    useState<Schema["HouseholdMembership"]["type"] | null>(null);
  const [projects, setProjects] = useState<
    Array<Schema["HouseholdProject"]["type"]>
  >([]);
  const [milestones, setMilestones] = useState<
    Array<Schema["HouseholdMilestone"]["type"]>
  >([]);
  const [updates, setUpdates] = useState<
    Array<Schema["HouseholdMilestoneUpdate"]["type"]>
  >([]);

  useEffect(() => {
    const membershipSub =
      client.models.HouseholdMembership.observeQuery().subscribe({
        next: (data) => setMembership(data.items[0] ?? null),
      });

    const projectSub =
      client.models.HouseholdProject.observeQuery().subscribe({
        next: (data) => setProjects([...data.items]),
      });

    const milestoneSub =
      client.models.HouseholdMilestone.observeQuery().subscribe({
        next: (data) => setMilestones([...data.items]),
      });

    const updateSub =
      client.models.HouseholdMilestoneUpdate.observeQuery().subscribe({
        next: (data) => setUpdates([...data.items]),
      });

    return () => {
      membershipSub.unsubscribe();
      projectSub.unsubscribe();
      milestoneSub.unsubscribe();
      updateSub.unsubscribe();
    };
  }, []);

  const currentHouseholdId = membership?.householdId ?? null;

  if (!membership || !currentHouseholdId) {
    return (
      <main>
        <h1>Family news</h1>
        <p>You need to be part of a household to see family news.</p>
      </main>
    );
  }

  const householdProjects = projects.filter(
    (p) => p.householdId === currentHouseholdId
  );
  const householdProjectIds = new Set(householdProjects.map((p) => p.id));

  const householdMilestones = milestones.filter((m) =>
    householdProjectIds.has(m.projectId)
  );
  const milestoneById = new Map(householdMilestones.map((m) => [m.id, m]));

  const householdUpdates = updates
    .filter((u) => milestoneById.has(u.milestoneId))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  type ViewMode = "HOUSEHOLD" | "MEMBERS";
  const [viewMode, setViewMode] = useState<ViewMode>("HOUSEHOLD");

  // Best-effort author extraction; Amplify adds createdBy/owner metadata on mutations.
  const updatesWithAuthor = householdUpdates.map((u) => {
    const createdBy = (u as any).createdBy ?? (u as any).owner ?? "Unknown member";
    return { ...u, createdBy };
  });

  const updatesByMember = updatesWithAuthor.reduce<
    Record<string, Array<(typeof updatesWithAuthor)[number]>>
  >(
    (acc, u) => {
      const key = u.createdBy || "Unknown member";
      if (!acc[key]) acc[key] = [];
      acc[key].push(u);
      return acc;
    },
    {}
  );

  function getProjectNameForUpdate(update: Schema["HouseholdMilestoneUpdate"]["type"]) {
    const milestone = milestoneById.get(update.milestoneId);
    if (!milestone) return "";
    const project = householdProjects.find((p) => p.id === milestone.projectId);
    return project?.name ?? "";
  }

  function getMilestoneTitle(update: Schema["HouseholdMilestoneUpdate"]["type"]) {
    const milestone = milestoneById.get(update.milestoneId);
    return milestone?.title ?? "";
  }

  return (
    <main>
      <h1>Family news</h1>
      <p>
        All recent updates from household projects, across every member, newest
        first.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button
          type="button"
          onClick={() => setViewMode("HOUSEHOLD")}
          style={{
            padding: "0.4rem 0.75rem",
            borderRadius: "0.35rem",
            border: viewMode === "HOUSEHOLD" ? "2px solid #646cff" : "1px solid #ccc",
            background: viewMode === "HOUSEHOLD" ? "#eef2ff" : "white",
          }}
        >
          Household
        </button>
        <button
          type="button"
          onClick={() => setViewMode("MEMBERS")}
          style={{
            padding: "0.4rem 0.75rem",
            borderRadius: "0.35rem",
            border: viewMode === "MEMBERS" ? "2px solid #646cff" : "1px solid #ccc",
            background: viewMode === "MEMBERS" ? "#eef2ff" : "white",
          }}
        >
          Members
        </button>
      </div>

      {viewMode === "HOUSEHOLD" ? (
        householdUpdates.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic", marginTop: "1rem" }}>
            No updates yet.
          </p>
        ) : (
          <ul style={{ marginTop: "1rem" }}>
            {householdUpdates.map((u) => (
              <li
                key={u.id}
                style={{
                  borderBottom: "1px solid #eee",
                  padding: "0.5rem 0",
                  marginBottom: "0.25rem",
                }}
              >
                <div style={{ fontSize: "0.85rem", color: "#666" }}>
                  {new Date(u.createdAt).toLocaleString()}
                </div>
                <div style={{ fontWeight: "bold" }}>
                  {getProjectNameForUpdate(u)} &mdash;{" "}
                  {getMilestoneTitle(u) || "Milestone"}
                </div>
                <div>{u.note || "Video update"}</div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div style={{ marginTop: "1rem", display: "grid", gap: "1rem" }}>
          {Object.keys(updatesByMember).length === 0 ? (
            <p style={{ color: "#888", fontStyle: "italic" }}>
              No member updates yet.
            </p>
          ) : (
            Object.entries(updatesByMember).map(([member, memberUpdates]) => (
              <div
                key={member}
                style={{
                  border: "1px solid #eee",
                  borderRadius: "0.5rem",
                  padding: "0.75rem",
                  background: "white",
                }}
              >
                <h3 style={{ margin: "0 0 0.5rem" }}>{member}</h3>
                {memberUpdates.length === 0 ? (
                  <p style={{ color: "#888", fontStyle: "italic" }}>
                    No updates yet.
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                    {memberUpdates.map((u) => (
                      <li key={u.id} style={{ marginBottom: "0.35rem" }}>
                        <div style={{ fontSize: "0.85rem", color: "#666" }}>
                          {new Date(u.createdAt).toLocaleString()}
                        </div>
                        <div style={{ fontWeight: "bold" }}>
                          {getProjectNameForUpdate(u)} &mdash;{" "}
                          {getMilestoneTitle(u) || "Milestone"}
                        </div>
                        <div>{u.note || "Video update"}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}
