import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";

export function HouseholdProjectsPage() {
  const [households, setHouseholds] =
    useState<Array<Schema["Household"]["type"]>>([]);
@@ -1100,9 +1102,36 @@ function HouseholdProjectsPage() {
  const [projects, setProjects] = useState<
    Array<Schema["HouseholdProject"]["type"]>
  >([]);
  const [milestones, setMilestones] = useState<
    Array<Schema["HouseholdMilestone"]["type"]>
  >([]);
  const [updates, setUpdates] = useState<
    Array<Schema["HouseholdMilestoneUpdate"]["type"]>
  >([]);

  // signed URLs for update videos
  const [updateVideoUrls, setUpdateVideoUrls] = useState<
    Record<string, string>
  >({});

  const [newProjectName, setNewProjectName] = useState("");

  // milestone dialog
  const [isMilestoneDialogOpen, setIsMilestoneDialogOpen] = useState(false);
  const [selectedProjectIdForMilestone, setSelectedProjectIdForMilestone] =
    useState<string | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");

  // update dialog
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [selectedMilestoneIdForUpdate, setSelectedMilestoneIdForUpdate] =
    useState<string | null>(null);
  const [newUpdateNote, setNewUpdateNote] = useState("");
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUploadingUpdate, setIsUploadingUpdate] = useState(false);

  // subscribe to household data
  useEffect(() => {
    const householdSub = client.models.Household.observeQuery().subscribe({
      next: (data) => setHouseholds([...data.items]),
@@ -1118,13 +1147,62 @@ function HouseholdProjectsPage() {
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
      householdSub.unsubscribe();
      membershipSub.unsubscribe();
      projectSub.unsubscribe();
      milestoneSub.unsubscribe();
      updateSub.unsubscribe();
    };
  }, []);

  // load signed video URLs for updates
  useEffect(() => {
    if (updates.length === 0) return;

    let cancelled = false;

    async function loadUrls() {
      const entries: [string, string][] = [];

      for (const update of updates) {
        if (!update.videoUrl || updateVideoUrls[update.id]) continue;

        try {
          const { url } = await getUrl({ path: update.videoUrl });
          if (!cancelled) {
            entries.push([update.id, url.href]);
          }
        } catch (err) {
          console.error("Failed to get URL for household update", update.id, err);
        }
      }

      if (!cancelled && entries.length > 0) {
        setUpdateVideoUrls((prev) => ({
          ...prev,
          ...Object.fromEntries(entries),
        }));
      }
    }

    loadUrls();

    return () => {
      cancelled = true;
    };
  }, [updates, updateVideoUrls]);

  const currentHouseholdId = membership?.householdId ?? null;
  const currentHousehold =
    currentHouseholdId != null
@@ -1135,6 +1213,27 @@ function HouseholdProjectsPage() {
    ? projects.filter((p) => p.householdId === currentHouseholdId)
    : [];

  // helper: video duration calculation (same as Dashboard)
  async function getVideoDurationInSeconds(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };

      video.onerror = () => {
        reject(new Error("Failed to load video metadata"));
      };

      video.src = URL.createObjectURL(file);
    });
  }

  // ===== project actions =====

  async function handleCreateProject(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!currentHouseholdId) return;
@@ -1149,6 +1248,116 @@ function HouseholdProjectsPage() {
    setNewProjectName("");
  }

  // ===== milestone actions =====

  function openMilestoneDialog(projectId: string) {
    setSelectedProjectIdForMilestone(projectId);
    setNewMilestoneTitle("");
    setIsMilestoneDialogOpen(true);
  }

  function closeMilestoneDialog() {
    setIsMilestoneDialogOpen(false);
    setSelectedProjectIdForMilestone(null);
  }

  async function handleCreateMilestone(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!selectedProjectIdForMilestone) return;
    const title = newMilestoneTitle.trim();
    if (!title) return;

    await client.models.HouseholdMilestone.create({
      title,
      projectId: selectedProjectIdForMilestone,
    });

    setNewMilestoneTitle("");
    setIsMilestoneDialogOpen(false);
    setSelectedProjectIdForMilestone(null);
  }

  async function deleteMilestone(id: string) {
    await client.models.HouseholdMilestone.delete({ id });
  }

  // ===== update actions =====

  function openUpdateDialog(milestoneId: string) {
    setSelectedMilestoneIdForUpdate(milestoneId);
    setNewUpdateNote("");
    setSelectedVideoFile(null);
    setUpdateError(null);
    setIsUpdateDialogOpen(true);
  }

  function closeUpdateDialog() {
    setIsUpdateDialogOpen(false);
    setSelectedMilestoneIdForUpdate(null);
    setSelectedVideoFile(null);
    setUpdateError(null);
  }

  async function handleCreateUpdate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!selectedMilestoneIdForUpdate) return;

    setUpdateError(null);

    if (!selectedVideoFile) {
      setUpdateError("Please select a video file.");
      return;
    }

    try {
      setIsUploadingUpdate(true);

      const durationSeconds = await getVideoDurationInSeconds(selectedVideoFile);
      if (durationSeconds > 60) {
        setIsUploadingUpdate(false);
        setUpdateError("Video must be 60 seconds or less.");
        return;
      }

      const path = `household-milestone-updates/${selectedMilestoneIdForUpdate}/${Date.now()}-${selectedVideoFile.name}`;

      const result = await uploadData({
        path,
        data: selectedVideoFile,
        options: {
          contentType: selectedVideoFile.type,
        },
      }).result;

      const note = newUpdateNote.trim();

      await client.models.HouseholdMilestoneUpdate.create({
        milestoneId: selectedMilestoneIdForUpdate,
        note,
        videoUrl: result?.path ?? path,
        durationSeconds: Math.round(durationSeconds),
      });

      setNewUpdateNote("");
      setSelectedVideoFile(null);
      setIsUpdateDialogOpen(false);
      setSelectedMilestoneIdForUpdate(null);
    } catch (err) {
      console.error("Household update upload failed:", err);
      setUpdateError(
        err instanceof Error
          ? err.message
          : "Something went wrong uploading the video."
      );
    } finally {
      setIsUploadingUpdate(false);
    }
  }

  async function deleteUpdate(id: string) {
    await client.models.HouseholdMilestoneUpdate.delete({ id });
  }

  if (!membership || !currentHousehold) {
    return (
      <main>
@@ -1163,6 +1372,7 @@ function HouseholdProjectsPage() {
      <h1>Household projects</h1>
      <p>Household: {currentHousehold.name}</p>

      {/* create project */}
      <section style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
        <form onSubmit={handleCreateProject}>
          <input
@@ -1176,21 +1386,303 @@ function HouseholdProjectsPage() {
        </form>
      </section>

      {/* projects + milestones + updates */}
      {householdProjects.length === 0 ? (
        <p style={{ color: "#888", fontStyle: "italic" }}>
          No household projects yet.
        </p>
      ) : (
        <ul>
          {householdProjects.map((p) => (
            <li key={p.id}>• {p.name}</li>
          ))}
        <ul style={{ listStyle: "none", padding: 0 }}>
          {householdProjects.map((project) => {
            const projectMilestones = milestones.filter(
              (m) => m.projectId === project.id
            );

            return (
              <li
                key={project.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <strong>{project.name}</strong>
                  <button onClick={() => openMilestoneDialog(project.id)}>
                    + add milestone
                  </button>
                </div>

                {projectMilestones.length === 0 ? (
                  <div style={{ color: "#888", fontStyle: "italic" }}>
                    No milestones yet
                  </div>
                ) : (
                  <ul style={{ marginLeft: "1rem" }}>
                    {projectMilestones.map((milestone) => {
                      const milestoneUpdates = updates.filter(
                        (u) => u.milestoneId === milestone.id
                      );
                      return (
                        <li
                          key={milestone.id}
                          style={{ marginBottom: "0.5rem" }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span>• {milestone.title}</span>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button
                                onClick={() =>
                                  openUpdateDialog(milestone.id)
                                }
                              >
                                + add update
                              </button>
                              <button
                                onClick={() => deleteMilestone(milestone.id)}
                              >
                                delete milestone
                              </button>
                            </div>
                          </div>

                          {/* updates under each milestone */}
                          {milestoneUpdates.length > 0 && (
                            <ul
                              style={{
                                marginLeft: "1.5rem",
                                marginTop: "0.25rem",
                              }}
                            >
                              {milestoneUpdates.map((update) => {
                                const videoSrc = updateVideoUrls[update.id];

                                return (
                                  <li
                                    key={update.id}
                                    style={{
                                      marginTop: "0.35rem",
                                      padding: "0.25rem 0",
                                      borderBottom: "1px solid #eee",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        gap: "0.5rem",
                                      }}
                                    >
                                      <div>
                                        <div style={{ fontSize: "0.9rem" }}>
                                          {update.note || "Video update"}
                                        </div>

                                        {videoSrc ? (
                                          <video
                                            src={videoSrc}
                                            controls
                                            style={{
                                              marginTop: "0.25rem",
                                              maxWidth: "100%",
                                              maxHeight: "200px",
                                              borderRadius: "0.25rem",
                                            }}
                                          />
                                        ) : (
                                          <div
                                            style={{
                                              marginTop: "0.25rem",
                                              fontSize: "0.8rem",
                                              color: "#888",
                                            }}
                                          >
                                            Loading video…
                                          </div>
                                        )}
                                      </div>

                                      <button
                                        onClick={() => deleteUpdate(update.id)}
                                        style={{ fontSize: "0.8rem" }}
                                      >
                                        delete
                                      </button>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Milestone dialog */}
      {isMilestoneDialogOpen && selectedProjectIdForMilestone && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
          onClick={closeMilestoneDialog}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              minWidth: "300px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>New household milestone</h2>
            <form onSubmit={handleCreateMilestone}>
              <input
                type="text"
                placeholder="Milestone title"
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                style={{ width: "100%", marginBottom: "1rem" }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                }}
              >
                <button type="button" onClick={closeMilestoneDialog}>
                  Cancel
                </button>
                <button type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update dialog */}
      {isUpdateDialogOpen && selectedMilestoneIdForUpdate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
          onClick={closeUpdateDialog}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              minWidth: "320px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>New household update</h2>
            <form onSubmit={handleCreateUpdate}>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Video (max 60 seconds)
              </label>
              <input
                type="file"
                accept="video/*"
                capture="user"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setSelectedVideoFile(file);
                  setUpdateError(null);
                }}
                style={{ marginBottom: "1rem", width: "100%" }}
              />

              <textarea
                placeholder="Optional note about this update"
                value={newUpdateNote}
                onChange={(e) => setNewUpdateNote(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "80px",
                  marginBottom: "0.75rem",
                  resize: "vertical",
                }}
              />

              {updateError && (
                <div
                  style={{
                    color: "red",
                    marginBottom: "0.75rem",
                    fontSize: "0.9rem",
                  }}
                >
                  {updateError}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={closeUpdateDialog}
                  disabled={isUploadingUpdate}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isUploadingUpdate}>
                  {isUploadingUpdate ? "Uploading..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
