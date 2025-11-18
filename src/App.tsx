import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../amplify/data/resource";
import { uploadData, getUrl } from "aws-amplify/storage";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>();

/* ===================== DASHBOARD (your existing app) ===================== */

function Dashboard() {
  const [updateVideoUrls, setUpdateVideoUrls] = useState<Record<string, string>>(
    {}
  );

  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);
  const [projects, setProjects] = useState<Array<Schema["Project"]["type"]>>([]);
  const [milestones, setMilestones] = useState<
    Array<Schema["Milestone"]["type"]>
  >([]);
  const [updates, setUpdates] = useState<
    Array<Schema["MilestoneUpdate"]["type"]>
  >([]);

  // Todo dialog
  const [isTodoDialogOpen, setIsTodoDialogOpen] = useState(false);
  const [newTodoContent, setNewTodoContent] = useState("");

  // Project dialog
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // Milestone dialog
  const [isMilestoneDialogOpen, setIsMilestoneDialogOpen] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [selectedProjectIdForMilestone, setSelectedProjectIdForMilestone] =
    useState<string | null>(null);

  // Update dialog (per milestone)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [selectedMilestoneIdForUpdate, setSelectedMilestoneIdForUpdate] =
    useState<string | null>(null);
  const [newUpdateNote, setNewUpdateNote] = useState("");

  // video file + error + uploading state
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUploadingUpdate, setIsUploadingUpdate] = useState(false);

  // 3 active task slots (Todo IDs)
  const [activeSlots, setActiveSlots] = useState<Array<string | null>>([
    null,
    null,
    null,
  ]);

  const { signOut } = useAuthenticator();

  // subscribe to data
  useEffect(() => {
    const todoSub = client.models.Todo.observeQuery().subscribe({
      next: (data) => setTodos([...data.items]),
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
      todoSub.unsubscribe();
      projectSub.unsubscribe();
      milestoneSub.unsubscribe();
      updateSub.unsubscribe();
    };
  }, []);

  // load signed URLs for each update video
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

  // ===== TODOS =====
  function openTodoDialog() {
    setNewTodoContent("");
    setIsTodoDialogOpen(true);
  }

  function closeTodoDialog() {
    setIsTodoDialogOpen(false);
  }

  async function handleCreateTodo(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const content = newTodoContent.trim();
    if (!content) return;

    await client.models.Todo.create({ content });
    setNewTodoContent("");
    setIsTodoDialogOpen(false);
  }

  function handleSlotChange(slotIndex: number, todoId: string) {
    setActiveSlots((prev) => {
      const copy = [...prev];
      copy[slotIndex] = todoId || null;
      return copy;
    });
  }

  async function deleteTodo(id: string) {
    setActiveSlots((prev) => prev.map((slotId) => (slotId === id ? null : slotId)));
    await client.models.Todo.delete({ id });
  }

  // ===== PROJECTS =====
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

  // ===== MILESTONES =====
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

  // ===== UPDATES =====
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
    <main>
      <h1>My todos</h1>

      {/* Top buttons */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button onClick={openTodoDialog}>+ new task</button>
        <button onClick={openProjectDialog}>+ new project</button>
      </div>

      {/* Active slots */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Active Tasks</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "1rem",
          }}
        >
          {activeSlots.map((slotTodoId, index) => {
            const todo = todos.find((t) => t.id === slotTodoId);
            return (
              <div
                key={index}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  minHeight: "120px",
                }}
              >
                <h3>Slot {index + 1}</h3>
                <select
                  value={slotTodoId ?? ""}
                  onChange={(e) => handleSlotChange(index, e.target.value)}
                  style={{ width: "100%", marginBottom: "0.75rem" }}
                >
                  <option value="">-- Select a task --</option>
                  {todos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.content}
                    </option>
                  ))}
                </select>

                {todo ? (
                  <div
                    style={{
                      background: "#f3f3f3",
                      padding: "0.5rem",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                    }}
                    onClick={() => deleteTodo(todo.id)}
                    title="Click to delete this task"
                  >
                    {todo.content}
                  </div>
                ) : (
                  <div style={{ color: "#888", fontStyle: "italic" }}>
                    No task selected
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Projects + milestones + updates */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Projects</h2>
        {projects.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            No projects yet. Click &quot;+ new project&quot; to add one.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {projects.map((project) => {
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
                                  const videoSrc =
                                    updateVideoUrls[update.id];

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
                                          onClick={() =>
                                            deleteUpdate(update.id)
                                          }
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
      </section>

      <div>
        🥳 App successfully hosted. Try creating projects, milestones, and
        updates.
        <br />
        <a href="https://docs.amplify.aws/react/start/quickstart/#make-frontend-updates">
          Review next step of this tutorial.
        </a>
      </div>

      <button onClick={signOut} style={{ marginTop: "1rem" }}>
        Sign out
      </button>

      {/* ===== Todo dialog ===== */}
      {isTodoDialogOpen && (
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
          onClick={closeTodoDialog}
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
            <h2 style={{ marginTop: 0 }}>New task</h2>
            <form onSubmit={handleCreateTodo}>
              <input
                type="text"
                placeholder="Task content"
                value={newTodoContent}
                onChange={(e) => setNewTodoContent(e.target.value)}
                style={{ width: "100%", marginBottom: "1rem" }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  justifyContent: "flex-end",
                }}
              >
                <button type="button" onClick={closeTodoDialog}>
                  Cancel
                </button>
                <button type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Project dialog ===== */}
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
          }}
          onClick={closeProjectDialog}
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

      {/* ===== Milestone dialog ===== */}
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

      {/* ===== Update dialog (per milestone) ===== */}
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

/* ===================== HOUSEHOLD HOME (calendar + buttons) ===================== */

function HouseholdHome() {
  const [households, setHouseholds] =
    useState<Array<Schema["Household"]["type"]>>([]);
  const [membership, setMembership] =
    useState<Schema["HouseholdMembership"]["type"] | null>(null);
  const [householdTasks, setHouseholdTasks] = useState<
    Array<Schema["HouseholdTask"]["type"]>
  >([]);

  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [householdToJoinId, setHouseholdToJoinId] = useState("");

  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [newTaskForDate, setNewTaskForDate] = useState("");

  // subscribe to household + membership + tasks
  useEffect(() => {
    const householdSub = client.models.Household.observeQuery().subscribe({
      next: (data) => setHouseholds([...data.items]),
    });

    const membershipSub =
      client.models.HouseholdMembership.observeQuery().subscribe({
        next: (data) => {
          const first = data.items[0] ?? null;
          setMembership(first);
        },
      });

    const taskSub = client.models.HouseholdTask.observeQuery().subscribe({
      next: (data) => setHouseholdTasks([...data.items]),
    });

    return () => {
      householdSub.unsubscribe();
      membershipSub.unsubscribe();
      taskSub.unsubscribe();
    };
  }, []);

  const currentHouseholdId = membership?.householdId ?? null;
  const currentHousehold =
    currentHouseholdId != null
      ? households.find((h) => h.id === currentHouseholdId) ?? null
      : null;

  const tasksForSelectedDate =
    currentHouseholdId == null
      ? []
      : householdTasks.filter(
          (t) =>
            t.householdId === currentHouseholdId &&
            t.scheduledFor === selectedDate
        );

  async function handleCreateHousehold(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = newHouseholdName.trim();
    if (!name || membership) return; // already in a household

    const { data: created, errors } = await client.models.Household.create({
      name,
    });

    if (!created) {
      console.error("Failed to create household", errors);
      return;
    }

    await client.models.HouseholdMembership.create({
      householdId: created.id,
    });

    setNewHouseholdName("");
  }

  async function handleJoinHousehold(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (membership) return;
    if (!householdToJoinId) return;

    await client.models.HouseholdMembership.create({
      householdId: householdToJoinId,
    });
    setHouseholdToJoinId("");
  }

  async function handleAddTaskForDate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!currentHouseholdId) return;
    const content = newTaskForDate.trim();
    if (!content) return;

    await client.models.HouseholdTask.create({
      householdId: currentHouseholdId,
      content,
      completed: false,
      scheduledFor: selectedDate,
    });

    setNewTaskForDate("");
  }

  async function toggleTaskCompleted(task: Schema["HouseholdTask"]["type"]) {
    await client.models.HouseholdTask.update({
      id: task.id,
      completed: !task.completed,
    });
  }

  async function deleteTask(id: string) {
    await client.models.HouseholdTask.delete({ id });
  }

  return (
    <main>
      <h1>Household</h1>

      {/* If user has no household: show create / join options */}
      {!membership && (
        <section style={{ marginBottom: "2rem" }}>
          <p>
            You are not part of a household yet. Create one or join an existing
            one.
          </p>

          <div
            style={{
              display: "grid",
              gap: "1.5rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              marginTop: "1rem",
            }}
          >
            {/* Create household */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "0.5rem",
                padding: "1rem",
              }}
            >
              <h2>Create household</h2>
              <form onSubmit={handleCreateHousehold}>
                <input
                  type="text"
                  placeholder="Household name"
                  value={newHouseholdName}
                  onChange={(e) => setNewHouseholdName(e.target.value)}
                  style={{ width: "100%", marginBottom: "0.75rem" }}
                />
                <button type="submit">Create household</button>
              </form>
            </div>

            {/* Join household */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "0.5rem",
                padding: "1rem",
              }}
            >
              <h2>Join household</h2>
              {households.length === 0 ? (
                <p style={{ color: "#888", fontStyle: "italic" }}>
                  No households exist yet. Create one to get started.
                </p>
              ) : (
                <form onSubmit={handleJoinHousehold}>
                  <select
                    value={householdToJoinId}
                    onChange={(e) => setHouseholdToJoinId(e.target.value)}
                    style={{ width: "100%", marginBottom: "0.75rem" }}
                  >
                    <option value="">Select a household</option>
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit">Join selected household</button>
                </form>
              )}
            </div>
          </div>
        </section>
      )}

      {/* If user is in a household: show calendar + nav buttons */}
      {membership && currentHousehold && (
        <>
          <section style={{ marginBottom: "1.5rem" }}>
            <h2>Your household: {currentHousehold.name}</h2>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
                marginTop: "0.75rem",
              }}
            >
              <Link to="/household/projects">
                <button type="button">Household Projects</button>
              </Link>
              <Link to="/household/grocery">
                <button type="button">Grocery &amp; Dinner</button>
              </Link>
              <Link to="/household/news">
                <button type="button">Family News</button>
              </Link>
            </div>
          </section>

          {/* Task calendar */}
          <section>
            <h3>Task calendar</h3>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <label>
                Date:&nbsp;
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </label>
            </div>

            <form
              onSubmit={handleAddTaskForDate}
              style={{ marginBottom: "1rem" }}
            >
              <input
                type="text"
                placeholder="Task for this day"
                value={newTaskForDate}
                onChange={(e) => setNewTaskForDate(e.target.value)}
                style={{ width: "100%", maxWidth: "400px", marginRight: "0.5rem" }}
              />
              <button type="submit">Add task</button>
            </form>

            {tasksForSelectedDate.length === 0 ? (
              <p style={{ color: "#888", fontStyle: "italic" }}>
                No tasks scheduled for this day.
              </p>
            ) : (
              <ul>
                {tasksForSelectedDate.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!t.completed}
                      onChange={() => toggleTaskCompleted(t)}
                    />
                    <span
                      style={{
                        textDecoration: t.completed ? "line-through" : "none",
                      }}
                    >
                      {t.content}
                    </span>
                    <button
                      onClick={() => deleteTask(t.id)}
                      style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}
                    >
                      delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {membership && !currentHousehold && (
        <p style={{ color: "red" }}>
          You have a household membership, but the household record could not be
          found.
        </p>
      )}
    </main>
  );
}

/* ===================== HOUSEHOLD PROJECTS PAGE ===================== */

/* ===================== HOUSEHOLD PROJECTS (with milestones + updates) ===================== */

function HouseholdProjectsPage() {
  const [households, setHouseholds] =
    useState<Array<Schema["Household"]["type"]>>([]);
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
    });

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
      ? households.find((h) => h.id === currentHouseholdId) ?? null
      : null;

  const householdProjects = currentHouseholdId
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
    const name = newProjectName.trim();
    if (!name) return;

    await client.models.HouseholdProject.create({
      householdId: currentHouseholdId,
      name,
    });

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
        <h1>Household projects</h1>
        <p>You need to be part of a household to see household projects.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Household projects</h1>
      <p>Household: {currentHousehold.name}</p>

      {/* create project */}
      <section style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
        <form onSubmit={handleCreateProject}>
          <input
            type="text"
            placeholder="New household project"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            style={{ width: "100%", maxWidth: "400px", marginRight: "0.5rem" }}
          />
          <button type="submit">Add project</button>
        </form>
      </section>

      {/* projects + milestones + updates */}
      {householdProjects.length === 0 ? (
        <p style={{ color: "#888", fontStyle: "italic" }}>
          No household projects yet.
        </p>
      ) : (
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


/* ===================== GROCERY + DINNER PAGE ===================== */

function HouseholdGroceryPage() {
  const [membership, setMembership] =
    useState<Schema["HouseholdMembership"]["type"] | null>(null);
  const [tasks, setTasks] = useState<Array<Schema["HouseholdTask"]["type"]>>(
    []
  );

  const [newGroceryItem, setNewGroceryItem] = useState("");
  const [newDinnerItem, setNewDinnerItem] = useState("");

  const groceryPrefix = "GROCERY: ";
  const dinnerPrefix = "DINNER: ";

  useEffect(() => {
    const membershipSub =
      client.models.HouseholdMembership.observeQuery().subscribe({
        next: (data) => setMembership(data.items[0] ?? null),
      });

    const taskSub = client.models.HouseholdTask.observeQuery().subscribe({
      next: (data) => setTasks([...data.items]),
    });

    return () => {
      membershipSub.unsubscribe();
      taskSub.unsubscribe();
    };
  }, []);

  const currentHouseholdId = membership?.householdId ?? null;

  const householdTasks = currentHouseholdId
    ? tasks.filter((t) => t.householdId === currentHouseholdId)
    : [];

  const groceryItems = householdTasks.filter((t) =>
    t.content.startsWith(groceryPrefix)
  );
  const dinnerItems = householdTasks.filter((t) =>
    t.content.startsWith(dinnerPrefix)
  );

  function stripPrefix(content: string, prefix: string) {
    return content.startsWith(prefix) ? content.slice(prefix.length) : content;
  }

  async function createTaskWithPrefix(
    text: string,
    prefix: string,
    e?: React.FormEvent
  ) {
    if (e) e.preventDefault();
    if (!currentHouseholdId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    await client.models.HouseholdTask.create({
      householdId: currentHouseholdId,
      content: `${prefix}${trimmed}`,
      completed: false,
    });
  }

  async function toggleTaskCompleted(task: Schema["HouseholdTask"]["type"]) {
    await client.models.HouseholdTask.update({
      id: task.id,
      completed: !task.completed,
    });
  }

  async function deleteTask(id: string) {
    await client.models.HouseholdTask.delete({ id });
  }

  if (!membership) {
    return (
      <main>
        <h1>Grocery &amp; Dinner</h1>
        <p>You need to be part of a household to use shared lists.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Grocery &amp; Dinner</h1>
      <p>
        Everyone in your household can add, check off, and remove items on these
        shared lists.
      </p>

      {/* Grocery list */}
      <section style={{ marginTop: "1.5rem", marginBottom: "2rem" }}>
        <h2>Grocery list</h2>
        <form
          onSubmit={(e) => createTaskWithPrefix(newGroceryItem, groceryPrefix, e)}
          style={{ marginBottom: "0.75rem" }}
        >
          <input
            type="text"
            placeholder="Add grocery item"
            value={newGroceryItem}
            onChange={(e) => setNewGroceryItem(e.target.value)}
            style={{ width: "100%", maxWidth: "400px", marginRight: "0.5rem" }}
          />
          <button type="submit">Add</button>
        </form>

        {groceryItems.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            No grocery items yet.
          </p>
        ) : (
          <ul>
            {groceryItems.map((t) => (
              <li
                key={t.id}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <input
                  type="checkbox"
                  checked={!!t.completed}
                  onChange={() => toggleTaskCompleted(t)}
                />
                <span
                  style={{
                    textDecoration: t.completed ? "line-through" : "none",
                  }}
                >
                  {stripPrefix(t.content, groceryPrefix)}
                </span>
                <button
                  onClick={() => deleteTask(t.id)}
                  style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dinner recommendations */}
      <section>
        <h2>Dinner recommendations</h2>
        <form
          onSubmit={(e) => createTaskWithPrefix(newDinnerItem, dinnerPrefix, e)}
          style={{ marginBottom: "0.75rem" }}
        >
          <input
            type="text"
            placeholder="Add dinner idea"
            value={newDinnerItem}
            onChange={(e) => setNewDinnerItem(e.target.value)}
            style={{ width: "100%", maxWidth: "400px", marginRight: "0.5rem" }}
          />
          <button type="submit">Add</button>
        </form>

        {dinnerItems.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            No dinner ideas yet.
          </p>
        ) : (
          <ul>
            {dinnerItems.map((t) => (
              <li
                key={t.id}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <input
                  type="checkbox"
                  checked={!!t.completed}
                  onChange={() => toggleTaskCompleted(t)}
                />
                <span
                  style={{
                    textDecoration: t.completed ? "line-through" : "none",
                  }}
                >
                  {stripPrefix(t.content, dinnerPrefix)}
                </span>
                <button
                  onClick={() => deleteTask(t.id)}
                  style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}


/* ===================== FAMILY NEWS PAGE ===================== */

function FamilyNewsPage() {
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

      {householdUpdates.length === 0 ? (
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
      )}
    </main>
  );
}



/* ===================== SIMPLE EXTRA PAGES ===================== */

function Page2() {
  return (
    <main>
      <h1>Page 2</h1>
      <p>Custom content for page 2.</p>
    </main>
  );
}

function Page3() {
  return (
    <main>
      <h1>Page 3</h1>
      <p>Custom content for page 3.</p>
    </main>
  );
}

function Page4() {
  return (
    <main>
      <h1>Page 4</h1>
      <p>Custom content for page 4.</p>
    </main>
  );
}

function Page5() {
  return (
    <main>
      <h1>Page 5</h1>
      <p>Custom content for page 5.</p>
    </main>
  );
}

/* ===================== APP SHELL WITH MENU BUTTON ===================== */

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <BrowserRouter>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #ddd",
          marginBottom: "1rem",
        }}
      >
        <span style={{ fontWeight: "bold" }}>My App</span>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            style={{ padding: "0.5rem 0.75rem" }}
          >
            Menu ▾
          </button>

          {menuOpen && (
            <nav
              style={{
                position: "absolute",
                right: 0,
                marginTop: "0.25rem",
                background: "white",
                border: "1px solid #ddd",
                borderRadius: "0.5rem",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                minWidth: "180px",
                zIndex: 1000,
              }}
            >
              <ul style={{ listStyle: "none", padding: "0.5rem", margin: 0 }}>
                <li>
                  <Link
                    to="/"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    to="/household"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Household
                  </Link>
                </li>
                <li>
                  <Link
                    to="/page2"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Page 2
                  </Link>
                </li>
                <li>
                  <Link
                    to="/page3"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Page 3
                  </Link>
                </li>
                <li>
                  <Link
                    to="/page4"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Page 4
                  </Link>
                </li>
                <li>
                  <Link
                    to="/page5"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Page 5
                  </Link>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/household" element={<HouseholdHome />} />
        <Route path="/household/projects" element={<HouseholdProjectsPage />} />
        <Route path="/household/grocery" element={<HouseholdGroceryPage />} />
        <Route path="/household/news" element={<FamilyNewsPage />} />
        {/* your other pages */}
        <Route path="/page2" element={<Page2 />} />
        <Route path="/page3" element={<Page3 />} />
        <Route path="/page4" element={<Page4 />} />
        <Route path="/page5" element={<Page5 />} />
      </Routes>

    </BrowserRouter>
  );
}

export default App;
