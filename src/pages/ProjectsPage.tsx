// src/pages/ProjectsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { uploadData, getUrl } from "aws-amplify/storage";
import { getCurrentUser } from "aws-amplify/auth";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Array<Schema["Project"]["type"]>>([]);
  const [milestones, setMilestones] = useState<
    Array<Schema["Milestone"]["type"]>
  >([]);
  const [updates, setUpdates] = useState<
    Array<Schema["MilestoneUpdate"]["type"]>
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // signed URLs for update videos
  const [updateVideoUrls, setUpdateVideoUrls] = useState<
    Record<string, string>
  >({});

  // project dialog
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
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

  // subscribe to data
  useEffect(() => {
    const projectSub = client.models.Project.observeQuery().subscribe({
      next: (data: any) => setProjects([...data.items]),
    });

    const milestoneSub = client.models.Milestone.observeQuery().subscribe({
      next: (data: any) => setMilestones([...data.items]),
    });

    const updateSub = client.models.MilestoneUpdate.observeQuery().subscribe({
      next: (data: any) => setUpdates([...data.items]),
    });

    return () => {
      projectSub.unsubscribe();
      milestoneSub.unsubscribe();
      updateSub.unsubscribe();
    };
  }, []);

  // get current signed-in user's id (owner field)
  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (!cancelled) setCurrentUserId(user.userId);
      })
      .catch((err) => {
        console.error("Failed to load current user", err);
        if (!cancelled) setCurrentUserId(null);
      });
    return () => {
      cancelled = true;
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
          console.error("Failed to get URL for update", update.id, err);
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

  // Filter to only the current user's projects/milestones/updates
  const myProjects = useMemo(() => {
    if (!currentUserId) return [];
    return projects.filter(
      (p) => (p as any).owner === currentUserId || (p as any).createdBy === currentUserId
    );
  }, [projects, currentUserId]);

  // helper: video duration
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
  function openProjectDialog() {
    setNewProjectName("");
    setIsProjectDialogOpen(true);
  }

  function closeProjectDialog() {
    setIsProjectDialogOpen(false);
  }

  async function handleCreateProject(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = newProjectName.trim();
    if (!name) return;

    await client.models.Project.create({ name });
    setNewProjectName("");
    setIsProjectDialogOpen(false);
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

    await client.models.Milestone.create({
      title,
      projectId: selectedProjectIdForMilestone,
    });

    setNewMilestoneTitle("");
    setIsMilestoneDialogOpen(false);
    setSelectedProjectIdForMilestone(null);
  }

  async function deleteMilestone(id: string) {
    await client.models.Milestone.delete({ id });
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

      const path = `milestone-updates/${selectedMilestoneIdForUpdate}/${Date.now()}-${selectedVideoFile.name}`;

      const result = await uploadData({
        path,
        data: selectedVideoFile,
        options: {
          contentType: selectedVideoFile.type,
        },
      }).result;

      const note = newUpdateNote.trim();

      await client.models.MilestoneUpdate.create({
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
      console.error("Upload failed:", err);
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
    await client.models.MilestoneUpdate.delete({ id });
  }

  return (
    <main
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "1rem",
        boxSizing: "border-box",
        minHeight: "100vh",
      }}
    >
      <h1>My Projects</h1>

      <section style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
        <button onClick={openProjectDialog}>+ new project</button>
      </section>

      {/* projects + milestones + updates */}
      <section>
        {myProjects.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            No projects yet.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {myProjects.map((project) => {
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
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.5rem",
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
                                flexWrap: "wrap",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "0.5rem",
                              }}
                            >
                              <span>• {milestone.title}</span>
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "0.5rem",
                                }}
                              >
                                <button
                                  onClick={() => openUpdateDialog(milestone.id)}
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

                            {/* Updates list under each milestone */}
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
                                          flexDirection: "column",
                                          gap: "0.25rem",
                                        }}
                                      >
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
                                              height: "auto",
                                              maxHeight: "220px",
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

                                        <div
                                          style={{
                                            display: "flex",
                                            justifyContent: "flex-end",
                                          }}
                                        >
                                          <button
                                            onClick={() =>
                                              deleteUpdate(update.id)
                                            }
                                            style={{ fontSize: "0.8rem" }}
                                          >
                                            delete
                                          </button>
                                        </div>
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
      </section>

      {/* Project dialog */}
      {isProjectDialogOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onClick={closeProjectDialog}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              width: "100%",
              maxWidth: "420px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>New project</h2>
            <form onSubmit={handleCreateProject}>
              <input
                type="text"
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                style={{ width: "100%", marginBottom: "1rem" }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <button type="button" onClick={closeProjectDialog}>
                  Cancel
                </button>
                <button type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
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
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onClick={closeMilestoneDialog}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              width: "100%",
              maxWidth: "420px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>New milestone</h2>
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
                  flexWrap: "wrap",
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
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onClick={closeUpdateDialog}
        >
          <div
            style={{
              background: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
              width: "100%",
              maxWidth: "440px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>New update</h2>
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
                  flexWrap: "wrap",
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
