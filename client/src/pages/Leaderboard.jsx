import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaTrophy, FaArrowLeft } from "react-icons/fa";

export default function Leaderboard() {
  const [players, setPlayers] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        setLoading(true);
        const res = await fetch(`http://localhost:3000/matches/leaderboard?period=all`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch leaderboard");
        const data = await res.json();
        setPlayers(data.players || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, [filter]);

  const handleBack = () => window.location.replace("/");

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <button onClick={handleBack} className="back-btn">
          <FaArrowLeft /> Back to Dashboard
        </button>
        <h2><FaTrophy /> Leaderboard</h2>
      </div>

      <div className="filter-buttons">
        <button
          className={filter === "weekly" ? "active" : ""}
          onClick={() => setFilter("weekly")}
        >
          Weekly
        </button>
        <button
          className={filter === "monthly" ? "active" : ""}
          onClick={() => setFilter("monthly")}
        >
          Monthly
        </button>
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          All-Time
        </button>
      </div>

      {loading ? (
        <p>Loading leaderboard...</p>
      ) : (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>ELO</th>
              <th>Wins</th>
              <th>Losses</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center" }}>
                  No data available
                </td>
              </tr>
            ) : (
              players.map((player, index) => (
                <tr key={player.id}>
                  <td>{index + 1}</td>
                  <td>{player.username}</td>
                  <td>{player.elo_rating}</td>
                  <td>{player.wins}</td>
                  <td>{player.losses}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
