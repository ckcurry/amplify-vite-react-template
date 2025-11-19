// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { uploadData } from "aws-amplify/storage";
import { client } from "../client";
import type { Schema } from "../../amplify/data/resource";

/* ===================== DASHBOARD ===================== */

export function Dashboard() {
  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);
  const [projects, setProjects] = useState<Array<Schema["Project"]["type"]>>([]);
  const [milestones, setMilestones] = useState<
    Array<Schema["Milestone"]["type"]>
  >([]);

  // Todo dialog
  const [isTodoDialogOpen, setIsTodoDialogOpen] = useState(false);
  const [newTodoContent, setNewTodoContent] = useState("");

  // Project dialog
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // 3 active task slots (Todo IDs)
  const [activeSlots, setActiveSlots] = useState<Array<string | null>>([
    null,
    null,
    null,
  ]);

  // Active project for the dashboard
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // ===== Update dialog for active project =====
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [selectedMilestoneIdForUpdate, setSelectedMilestoneIdForUpdate] =
    useState<string | null>(null);
  const [newUpdateNote, setNewUpdateNote] = useState("");
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUploadingUpdate, setIsUploadingUpdate] = useState(false);

  const { signOut } = useAuthenticator();

  // subscribe to data (todos, projects, milestones only)
  useEffect(() => {
    const todoSub = client.models.Todo.observeQuery().subscribe({
      next: (data: any) => setTodos([...data.items]),
    });

    const projectSub = client.models.Project.observeQuery().subscribe({
      next: (data: any) => setProjects([...data.items]),
    });

    const milestoneSub = client.models.Milestone.observeQuery().subscribe({
      next: (data: any) => setMilestones([...data.items]),
    });

    return () => {
      todoSub.unsubscribe();
      projectSub.unsubscribe();
      milestoneSub.unsubscribe();
    };
  }, []);

  // Load active project from localStorage on first render
  useEffect(() => {
    const stored = window.localStorage.getItem("activeProjectId");
    if (stored) {
      setActiveProjectId(stored);
    }
  }, []);

  // Persist active project selection
  useEffect(() => {
    if (activeProjectId) {
      window.localStorage.setItem("activeProjectId", activeProjectId);
    } else {
      window.localStorage.removeItem("activeProjectId");
    }
  }, [activeProjectId]);

  // ===== helper: video duration =====
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

  // ===== PROJECTS (create + active project only) =====
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

  // ===== ACTIVE PROJECT DERIVED DATA =====
  const activeProject =
    activeProjectId != null
      ? projects.find((p) => p.id === activeProjectId) ?? null
      : null;

  const activeProjectMilestones = activeProject
    ? milestones.filter((m) => m.projectId === activeProject.id)
    : [];

  // ===== UPDATE (for active project) =====
  function openUpdateDialog() {
    if (!activeProject || activeProjectMilestones.length === 0) return;
    const firstMilestone = activeProjectMilestones[0];
    setSelectedMilestoneIdForUpdate(firstMilestone.id);
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
    if (!selectedMilestoneIdForUpdate) {
      setUpdateError("Please select a milestone.");
      return;
    }
    if (!selectedVideoFile) {
      setUpdateError("Please select a video file.");
      return;
    }

    try {
      setIsUploadingUpdate(true);
      setUpdateError(null);

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

  return (
    <main
      style={{
        width: "100%",
        padding: "1rem",
        boxSizing: "border-box",
        minHeight: "100vh",
      }}
    >
      <h1
        style={{
          fontSize: "1.75rem",
          marginBottom: "1.5rem", // more space so buttons aren't covered
          textAlign: "center",
          wordBreak: "break-word",
        }}
      >
        Project by Smallworld
      </h1>

      {/* Top buttons */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "1.25rem",
          justifyContent: "center",
        }}
      >
        <button onClick={openTodoDialog}>+ new task</button>
        <button onClick={openProjectDialog}>+ new project</button>
      </div>

      {/* Active slots */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Active Tasks</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
                  boxSizing: "border-box",
                }}
              >
                <h3>Slot {index + 1}</h3>
                <select
                  value={slotTodoId ?? ""}
                  onChange={(e) => handleSlotChange(index, e.target.value)}
                  style={{
                    width: "100%",
                    marginBottom: "0.75rem",
                    maxWidth: "100%",
                  }}
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
                      wordBreak: "break-word",
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

      {/* Active project */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Active Project</h2>

        {projects.length === 0 ? (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            No projects yet. Create a project to choose an active one.
          </p>
        ) : (
          <>
            <select
              value={activeProjectId ?? ""}
              onChange={(e) => setActiveProjectId(e.target.value || null)}
              style={{
                width: "100%",
                maxWidth: "400px",
                marginBottom: "0.75rem",
              }}
            >
              <option value="">-- Select active project --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {activeProject ? (
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  marginTop: "0.5rem",
                  boxSizing: "border-box",
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
                  <h3 style={{ margin: 0, wordBreak: "break-word" }}>
                    {activeProject.name}
                  </h3>

                  <button
                    onClick={openUpdateDialog}
                    disabled={activeProjectMilestones.length === 0}
                  >
                    + add update
                  </button>
                </div>

                {activeProjectMilestones.length === 0 ? (
                  <p style={{ color: "#888", fontStyle: "italic" }}>
                    No milestones yet for this project.
                  </p>
                ) : (
                  <ul style={{ marginLeft: "1rem" }}>
                    {activeProjectMilestones.map((m) => (
                      <li key={m.id}>• {m.title}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p style={{ color: "#888", fontStyle: "italic" }}>
                No active project selected.
              </p>
            )}
          </>
        )}
      </section>

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
            padding: "1rem",
            boxSizing: "border-box",
          }}
          onClick={closeTodoDialog}
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
              boxSizing: "border-box",
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
                  flexWrap: "wrap",
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
              boxSizing: "border-box",
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

      {/* ===== Update dialog (for active project) ===== */}
      {isUpdateDialogOpen && activeProject && (
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
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>New update</h2>

            {/* Milestone picker for this active project */}
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Milestone
            </label>
            <select
              value={selectedMilestoneIdForUpdate ?? ""}
              onChange={(e) =>
                setSelectedMilestoneIdForUpdate(
                  e.target.value || null
                )
              }
              style={{
                width: "100%",
                marginBottom: "1rem",
              }}
            >
              {activeProjectMilestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>

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
