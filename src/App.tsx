import { useEffect, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../amplify/data/resource";
import { uploadData } from "aws-amplify/storage";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>();

function App() {
  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);
  const [projects, setProjects] = useState<Array<Schema["Project"]["type"]>>([]);
  const [milestones, setMilestones] = useState<Array<Schema["Milestone"]["type"]>>([]);
  const [updates, setUpdates] = useState<Array<Schema["MilestoneUpdate"]["type"]>>([]);

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

  // ⭐ NEW: video file + error + uploading state
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

  async function getVideoDurationInSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };

    video.onerror = (_e) => {
      reject(new Error("Failed to load video metadata"));
    };

    video.src = URL.createObjectURL(file);
  });
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

    // ⏱ check duration <= 60s
    const durationSeconds = await getVideoDurationInSeconds(selectedVideoFile);
    if (durationSeconds > 60) {
      setIsUploadingUpdate(false);
      setUpdateError("Video must be 60 seconds or less.");
      return;
    }

    // ✅ use `path`, and keep it under milestone-updates/*
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
      videoUrl: result?.path ?? path,   // store the Storage path
      durationSeconds: Math.round(durationSeconds),
    });

    setNewUpdateNote("");
    setSelectedVideoFile(null);
    setIsUpdateDialogOpen(false);
    setSelectedMilestoneIdForUpdate(null);
  } catch (err) {
    console.error("Upload failed:", err);
    // show the real error so we can see what's happening
    setUpdateError(
      err instanceof Error ? err.message : "Something went wrong uploading the video."
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
                              {/* ⭐ Add update button per milestone */}
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
                                {milestoneUpdates.map((update) => (
                                  <li
                                    key={update.id}
                                    style={{ cursor: "pointer" }}
                                    title="Click to delete update"
                                    onClick={() => deleteUpdate(update.id)}
                                  >
                                    - {update.note || "Video update"}
                                  </li>
                                ))}
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
        🥳 App successfully hosted. Try creating projects, milestones, and updates.
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
              {/* 🎥 video picker/recorder */}
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Video (max 60 seconds)
              </label>
              <input
                type="file"
                accept="video/*"
                // capture hints camera on mobile browsers
                capture="user"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setSelectedVideoFile(file);
                  setUpdateError(null);
                }}
                style={{ marginBottom: "1rem", width: "100%" }}
              />
      
              {/* optional note */}
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
                <button type="button" onClick={closeUpdateDialog} disabled={isUploadingUpdate}>
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

export default App;
