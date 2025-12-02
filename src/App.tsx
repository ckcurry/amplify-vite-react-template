// src/App.tsx
import { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

// Page components
import { Dashboard } from "./pages/Dashboard";
import { HouseholdHome } from "./pages/HouseholdHome";
import { ProfilePage } from "./pages/ProfilePage";
import { CommunityPage } from "./pages/CommunityPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { HouseholdProjectsPage } from "./pages/HouseholdProjectsPage";
import { TaskPage } from "./pages/TaskPage";

function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f5f5f7",
      }}
    >
      {/* Header with app name + menu */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #ddd",
          background: "#ffffff",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <span
          style={{
            fontWeight: "bold",
            fontSize: "1.1rem",
            whiteSpace: "nowrap",
          }}
        >
          Project by Smallworld
        </span>

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
                minWidth: "200px",
                zIndex: 200,
              }}
            >
              <ul
                style={{
                  listStyle: "none",
                  padding: "0.5rem",
                  margin: 0,
                }}
              >
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
                    to="/community"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Community
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
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Profile
                  </Link>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </header>

      {/* Main routed content */}
      <div style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/household" element={<HouseholdHome />} />
          <Route
            path="/household-projects"
            element={<HouseholdProjectsPage />}
          />
          <Route path="/tasks" element={<TaskPage />} />
        </Routes>
      </div>
    </div>
  );
}

// 👇 default export so main.tsx can `import App from "./App"`
export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
