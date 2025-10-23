import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import { FaArrowRight, FaArrowLeft } from "react-icons/fa";

export default function MatchReplay() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [moves, setMoves] = useState([]);
  const [match, setMatch] = useState(null);
  const [currentMove, setCurrentMove] = useState(0);
  const [fen, setFen] = useState("start");

  useEffect(() => {
    async function fetchMoves() {
      try {
        const res = await fetch(`http://localhost:3000/matches/replay/${matchId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch match moves");
        const data = await res.json();
        setMoves(data.moves);
        setMatch(data.match);
      } catch (err) {
        console.error(err);
        navigate("/match-history");
      }
    }
    fetchMoves();
  }, [matchId, navigate]);

  const nextMove = () => {
    if (currentMove < moves.length) {
      const nextFen = moves[currentMove].fen_after_move;
      setFen(nextFen || fen);
      setCurrentMove(currentMove + 1);
    }
  };

  const prevMove = () => {
    if (currentMove > 0) {
      const prevFen = currentMove === 1 ? "start" : moves[currentMove - 2].fen_after_move;
      setFen(prevFen);
      setCurrentMove(currentMove - 1);
    }
  };

  const resetReplay = () => {
    setCurrentMove(0);
    setFen("start");
  };

  return (
    <div className="replay-container">
      <h2>Match Replay</h2>
      <button className="back-btn" onClick={() => navigate("/match-history")}>
        Back to Match History
      </button>
      {match && (
        <div className="match-info">
          <p>
            <strong>Mode:</strong> {match.mode} | <strong>Type:</strong> {match.match_type}
          </p>
          <p>
            <strong>White:</strong> {match.white_username || "Guest"} |{" "}
            <strong>Black:</strong> {match.black_username || "Guest"}
          </p>
          <p>
            <strong>Winner:</strong> {match.winner_username || "Draw"}
          </p>
        </div>
      )}

      <Chessboard position={fen} />

      <div className="replay-controls">
        <button onClick={prevMove} disabled={currentMove === 0}>
          <FaArrowLeft/>
        </button>
        <button onClick={nextMove} disabled={currentMove === moves.length}>
         <FaArrowRight />
        </button>
        <button onClick={resetReplay}>⟲ Reset</button>
      </div>

      <p>
        Move {currentMove} of {moves.length}
      </p>
    </div>
  );
}
