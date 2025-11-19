// src/App.tsx
import { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

// your pages
import { Dashboard } from "./pages/Dashboard";
import { HouseholdHome } from "./pages/HouseholdHome";
import { HouseholdProjectsPage } from "./pages/HouseholdProjectsPage";
import { HouseholdGroceryPage } from "./pages/HouseholdGroceryPage";
import { FamilyNewsPage } from "./pages/FamilyNewsPage";

function AppInner() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* HEADER WITH NAME + MENU */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #ddd",
          background: "#f9fafb",
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
                    to="/household"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Household
                  </Link>
                </li>
                <li>
                  <Link
                    to="/household-projects"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Household Projects
                  </Link>
                </li>
                <li>
                  <Link
                    to="/household-grocery"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Grocery & Dinner
                  </Link>
                </li>
                <li>
                  <Link
                    to="/family-news"
                    onClick={() => setMenuOpen(false)}
                    style={{ display: "block", padding: "0.25rem 0" }}
                  >
                    Family News
                  </Link>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </header>

      {/* MAIN ROUTED CONTENT */}
      <div style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/household" element={<HouseholdHome />} />
          <Route
            path="/household-projects"
            element={<HouseholdProjectsPage />}
          />
          <Route
            path="/household-grocery"
            element={<HouseholdGroceryPage />}
          />
          <Route path="/family-news" element={<FamilyNewsPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
