import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";
import { getUrl } from "aws-amplify/storage";

type WithOwner = { owner?: string; createdBy?: string };

export function MemberNewsPage() {
  const [membership, setMembership] =
    useState<Schema["HouseholdMembership"]["type"] | null>(null);
  const [allMemberships, setAllMemberships] = useState<
    Array<Schema["HouseholdMembership"]["type"]>
  >([]);
  const [projects, setProjects] = useState<Array<Schema["Project"]["type"]>>(
    []
  );
  const [milestones, setMilestones] = useState<
    Array<Schema["Milestone"]["type"]>
  >([]);
  const [updates, setUpdates] = useState<
    Array<Schema["MilestoneUpdate"]["type"]>
  >([]);
  const [updateVideoUrls, setUpdateVideoUrls] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    const membershipSub =
      client.models.HouseholdMembership.observeQuery().subscribe({
        next: (data) => {
          setAllMemberships([...data.items]);
          setMembership(data.items[0] ?? null);
        },
      });

    const projectSub = client.models.Project.observeQuery().subscribe({
      next: (data) => setProjects([...data.items]),
    });

    const milestoneSub = client.models.Milestone.observeQuery().subscribe({
      next: (data) => setMilestones([...data.items]),
    });

    const updateSub = client.models.MilestoneUpdate.observeQuery().subscribe({
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
  const householdMembers = useMemo(() => {
    if (!currentHouseholdId) return [];
    return allMemberships.filter((m) => m.householdId === currentHouseholdId);
  }, [allMemberships, currentHouseholdId]);

  const householdMemberOwners = new Set(
    householdMembers
      .map((m) => (m as unknown as WithOwner).owner ?? (m as unknown as WithOwner).createdBy)
      .filter((o): o is string => !!o)
  );

  const memberProjects = projects.filter((p) => {
    const owner = (p as unknown as WithOwner).owner ?? (p as unknown as WithOwner).createdBy;
    return owner && householdMemberOwners.has(owner);
  });

  const memberProjectIds = new Set(memberProjects.map((p) => p.id));
  const memberMilestones = milestones.filter((m) =>
    memberProjectIds.has(m.projectId)
  );
  const milestoneById = new Map(memberMilestones.map((m) => [m.id, m]));

  const memberUpdates = updates
    .filter((u) => milestoneById.has(u.milestoneId))
    .map((u) => {
      const milestone = milestoneById.get(u.milestoneId);
      const project = milestone
        ? memberProjects.find((p) => p.id === milestone.projectId)
        : null;
      const owner =
        (project as unknown as WithOwner | null | undefined)?.owner ??
        (project as unknown as WithOwner | null | undefined)?.createdBy ??
        "Unknown member";
      return { update: u, milestone, project, owner };
    })
    .sort(
      (a, b) =>
        new Date(b.update.createdAt).getTime() -
        new Date(a.update.createdAt).getTime()
    );

  // Load signed URLs for videos in view
  useEffect(() => {
    let cancelled = false;
    async function loadUrls() {
      const entries: [string, string][] = [];
      for (const { update } of memberUpdates) {
        if (!update.videoUrl || updateVideoUrls[update.id]) continue;
        try {
          const { url } = await getUrl({ path: update.videoUrl });
          if (!cancelled) entries.push([update.id, url.href]);
        } catch (err) {
          console.error("Failed to load video URL", update.id, err);
        }
      }
      if (!cancelled && entries.length > 0) {
        setUpdateVideoUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    }
    loadUrls();
    return () => {
      cancelled = true;
    };
  }, [memberUpdates, updateVideoUrls]);

  if (!membership || !currentHouseholdId) {
    return (
      <main>
        <h1>Member news</h1>
        <p>You need to be part of a household to see member updates.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Member news</h1>
      <p>Personal project updates from members of your household.</p>

      <div style={{ margin: "0.5rem 0 1rem" }}>
        <Link to="/family-news">
          <button type="button">Go to Family News</button>
        </Link>
      </div>

      {memberUpdates.length === 0 ? (
        <p style={{ color: "#888", fontStyle: "italic", marginTop: "1rem" }}>
          No member updates yet.
        </p>
      ) : (
        <ul style={{ marginTop: "1rem", listStyle: "none", padding: 0 }}>
          {memberUpdates.map(({ update, milestone, project, owner }) => {
            const videoSrc = updateVideoUrls[update.id];
            return (
              <li
                key={update.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: "0.5rem",
                  padding: "0.75rem",
                  marginBottom: "0.75rem",
                  background: "white",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {owner || "Unknown member"}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#666" }}>
                    {new Date(update.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>
                  {(project?.name ?? "Project")} &mdash;{" "}
                  {milestone?.title ?? "Milestone"}
                </div>
                <div style={{ marginBottom: "0.35rem" }}>
                  {update.note || "Video update"}
                </div>
                {videoSrc ? (
                  <video
                    src={videoSrc}
                    controls
                    style={{
                      width: "100%",
                      maxHeight: "260px",
                      borderRadius: "0.35rem",
                      background: "#000",
                    }}
                  />
                ) : update.videoUrl ? (
                  <div style={{ fontSize: "0.85rem", color: "#888" }}>
                    Loading video…
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
