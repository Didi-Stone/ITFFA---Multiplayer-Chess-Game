import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import QuickMatch from "./pages/QuickMatch";
import OnlineMatch from "./pages/OnlineMatch";
import PrivateMatch from "./pages/PrivateMatch";
import MatchHistory from "./pages/MatchHistory";
import MatchReplay from "./pages/MatchReplay"
import Leaderboard from "./pages/Leaderboard";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("http://localhost:3000/auth/me", {
          credentials: "include", 
        });
        if (!res.ok) throw new Error("Not logged in");
        const data = await res.json();
        setUser(data.user);
      } catch (err) {
        console.log("User not logged in:", err);
        navigate("/Login"); 
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [navigate]);

  if (loading) return <p>Loading...</p>;

  return (
    <Routes>
      <Route path="/quick-match" element={<QuickMatch user={user} />} />
      <Route path="/online-match" element={<OnlineMatch user={user} />} />
      <Route path="/private-match" element={<PrivateMatch user={user} />} />
      <Route path="/match-history" element={<MatchHistory user={user} />} />
      <Route path="/match-replay/:matchId" element={<MatchReplay user={user} />} />
      <Route path="/leaderboard" element={<Leaderboard user={user} />} />
    </Routes>
  );
}
