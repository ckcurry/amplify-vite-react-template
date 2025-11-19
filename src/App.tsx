import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { Schema } from "../amplify/data/resource";
import { uploadData, getUrl } from "aws-amplify/storage";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>();

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
