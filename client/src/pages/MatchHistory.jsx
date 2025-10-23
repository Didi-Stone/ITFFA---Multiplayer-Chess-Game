import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaMoon, FaSun } from "react-icons/fa";

export default function MatchHistory({ user }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [filteredMatches, setFilteredMatches] = useState([]);
  const [filterType, setFilterType] = useState("all");
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    async function fetchMatches() {
      if (!user?.id) return;

      try {
        const res = await fetch("http://localhost:3000/matches/history", {
        credentials: "include",
      });
        if (!res.ok) throw new Error("Failed to fetch matches");
        const data = await res.json();
        setMatches(data.matches);
        setFilteredMatches(data.matches);
      } catch (err) {
        console.error("Error fetching matches:", err);
      }
    }

    fetchMatches();
  }, [user]);

  useEffect(() => {
    if (filterType === "all") {
      setFilteredMatches(matches);
    } else {
      setFilteredMatches(matches.filter((m) => m.match_type === filterType));
    }
  }, [filterType, matches]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

  const handleBack = () => window.location.replace("/");

  return (
    <div className={`match-history-page ${darkMode ? "dark" : ""}`}>
      <header className="history-header">
        <h2>Match History</h2>
        <button onClick={() => setDarkMode(!darkMode)} className="dark-toggle">
          {darkMode ? <FaSun /> : <FaMoon />}
        </button>
        <button onClick={handleBack} className="back-btn">Back to Dashboard</button>
      </header>

      <div className="filter-container">
        <button
          className={filterType === "all" ? "active" : ""}
          onClick={() => setFilterType("all")}
        >
          All
        </button>
        <button
          className={filterType === "local" ? "active" : ""}
          onClick={() => setFilterType("local")}
        >
          Local
        </button>
        <button
          className={filterType === "online" ? "active" : ""}
          onClick={() => setFilterType("online")}
        >
          Online
        </button>
        <button
          className={filterType === "private" ? "active" : ""}
          onClick={() => setFilterType("private")}
        >
          Private
        </button>
      </div>

      <div className="table-container">
        <table className="match-table">
          <thead>
            <tr>
              <th>White</th>
              <th>Black</th>
              <th>Winner</th>
              <th>Mode</th>
              <th>Type</th>
              <th>Start Time</th>
              <th>Replay</th>
            </tr>
          </thead>
          <tbody>
            {filteredMatches.length > 0 ? (
              filteredMatches.map((match) => (
                <tr key={match.id}>
                  <td>
                    {match.white_player_id === user.id ? "You" : match.white_username || "Guest"}
                  </td>
                  <td>
                    {match.black_player_id === user.id ? "You" : match.black_username || "Guest"}
                  </td>
                  <td>
                    {match.winner_id
                      ? match.winner_id === user.id
                        ? "You"
                        : match.winner_username
                      : "Draw"}
                  </td>
                  <td>{match.mode || "-"}</td>
                  <td className={`type-${match.match_type}`}>{match.match_type}</td>
                  <td>{new Date(match.start_time).toLocaleString("en-ZA", { hour12: false })}</td>
                  <td>
                    <button
                      className="btn primary"
                      onClick={() => navigate(`/match-replay/${match.id}`)}
                    >
                      Replay
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="9" className="no-data">
                  No matches found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
