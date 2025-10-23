import React, { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import {FaSun, FaMoon, FaUndo, FaRedo, FaArrowLeft, FaCopy,} from "react-icons/fa";
import axios from "axios";

export default function QuickMatch() {
  const gameRef = useRef(new Chess());
  const containerRef = useRef(null);

  const [user, setUser] = useState(null);
  const [boardWidth, setBoardWidth] = useState(480);
  const [fen, setFen] = useState(gameRef.current.fen());
  const [darkMode, setDarkMode] = useState(false);
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedMode, setSelectedMode] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [whiteTime, setWhiteTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);
  const [currentTurn, setCurrentTurn] = useState("w");
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState("");
  const [matchSaved, setMatchSaved] = useState(false);
  const [players, setPlayers] = useState([]);

  const timeControls = { classic: 10 * 60, blitz: 5 * 60, bullet: 2 * 60 };

  useEffect(() => {
    axios
      .get("http://localhost:3000/auth/me", { withCredentials: true })
      .then((res) => setUser(res.data.user))
      .catch((err) => console.error("Failed to fetch user:", err));
  }, []);

  const computeSize = (containerWidth) => {
    const maxBoard = 700;
    const paddingV = 160;
    const availHeight = Math.max(window.innerHeight - paddingV, 200);
    return Math.floor(Math.min(containerWidth, availHeight, maxBoard));
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setBoardWidth(computeSize(el.clientWidth));

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries)
        setBoardWidth(computeSize(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!gameStarted || !selectedMode) return;

    const interval = setInterval(() => {
      const turn = gameRef.current.turn();
      setCurrentTurn(turn);

      if (turn === "w") {
        setWhiteTime((prev) => {
          if (prev <= 1) {
            endGame("black", "Time’s up! Black wins.");
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime((prev) => {
          if (prev <= 1) {
            endGame("white", "Time’s up! White wins.");
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameStarted, selectedMode]);

  const onDrop = (sourceSquare, targetSquare) => {
    const game = gameRef.current;
    const move = game.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    if (!move) return false;

    setMoveHistory((prev) => [
      ...prev,
      { san: move.san, fen_after_move: game.fen() },
    ]);
    setFen(game.fen());
    setCurrentTurn(game.turn());

    if (game.isGameOver()) {
      let winner = "draw";
      if (game.isCheckmate()) winner = game.turn() === "w" ? "black" : "white";
      const message =
        game.isCheckmate()
          ? `Checkmate! ${winner.charAt(0).toUpperCase() + winner.slice(1)} wins.`
          : "Game Over!";
      endGame(winner, message);
    }

    return true;
  };

  const toggleDarkMode = () => setDarkMode(!darkMode);

  const handleStartLocalMatch = () => {
    if (!selectedMode || !selectedColor) {
      alert("Please select a game mode and colour.");
      return;
    }

    if (!user) {
      alert("Please log in to start a match.");
      return;
    }

    const game = new Chess();
    gameRef.current = game;
    setFen(game.fen());
    setMoveHistory([]);
    setPlayers([
      { username: user.username, color: selectedColor, id: user.id },
      { username: "Guest", color: selectedColor === "white" ? "black" : "white", id: null },
    ]);
      setWhiteTime(timeControls[selectedMode]);
      setBlackTime(timeControls[selectedMode]);
      setCurrentTurn("w");
      setGameStarted(true);
      setGameOverMessage("");
      setMatchSaved(false);
  };

  const handleUndo = () => {
    const game = gameRef.current;
    game.undo();
    setFen(game.fen());
    setMoveHistory((prev) => prev.slice(0, -1));
  };

  const handleReset = () => {
    const game = new Chess();
    gameRef.current = game;
    setFen(game.fen());
    setMoveHistory([]);
    setGameStarted(false);
    setSelectedMode("");
    setSelectedColor("");
    setWhiteTime(0);
    setBlackTime(0);
    setGameOverMessage("");
    setMatchSaved(false);
    setPlayers([]);
  };

  const handleCopyMoves = () => {
    const moves = moveHistory.map((m) => m.san).join(" ");
    navigator.clipboard.writeText(moves);
    alert("Move history copied!");
  };

  const handleBack = () => window.location.replace("/");

  const endGame = (winner, message) => {
    setGameOverMessage(message);
    if (!matchSaved && players.length === 2) saveMatchToDB(winner);
  };

  const saveMatchToDB = async (winner) => {
  if (!user || matchSaved) return;

  let whiteId = null;
  let blackId = null;
  let winnerId = null;

  if (selectedColor === "white") {
    whiteId = user.id; 
    blackId = null;    
  } else {
    whiteId = null;  
    blackId = user.id; 
  }

  if (winner === "white") winnerId = selectedColor === "white" ? user.id : null;
  else if (winner === "black") winnerId = selectedColor === "black" ? user.id : null;

  const matchData = {
    winner,
    mode: selectedMode,
    type: "local",
    local_user_color: selectedColor,
    moves: moveHistory.map((m, i) => ({
      san: m.san,
      fen_after_move: m.fen_after_move,
      move_number: i + 1,
    })),
    whiteId,
    blackId,
    winnerId,
    finalFen: gameRef.current.fen(),
  };

  try {
    const res = await fetch("http://localhost:3000/matches/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(matchData),
    });
    const data = await res.json();
    console.log("Match saved:", data);
    setMatchSaved(true);
  } catch (err) {
    console.error("Failed to save match:", err);
  }
};
  return (
    <div className={`quickmatch-page ${darkMode ? "dark" : ""}`}>
      <div className="quickmatch-wrapper" ref={containerRef}>
        <nav className="board-nav">
          <button onClick={handleBack} className="icon-btn"><FaArrowLeft /></button>
          <h2>Quick Match</h2>
          <div className="nav-actions">
            <button onClick={handleUndo} className="icon-btn"><FaUndo /></button>
            <button onClick={handleReset} className="icon-btn"><FaRedo /></button>
            <button onClick={toggleDarkMode} className="icon-btn">{darkMode ? <FaSun /> : <FaMoon />}</button>
          </div>
        </nav>

        {!gameStarted && !gameOverMessage && (
          <div className="mode-selection">
            <h3>Select Game Mode</h3>
            <select value={selectedMode} onChange={(e) => setSelectedMode(e.target.value)}>
              <option value="">-- Choose Mode --</option>
              <option value="classic">Classic (10 min)</option>
              <option value="blitz">Blitz (5 min)</option>
              <option value="bullet">Bullet (2 min)</option>
            </select>

            <h3>Choose Your Colour</h3>
            <select value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)}>
              <option value="">-- Choose Colour --</option>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>

            <button onClick={handleStartLocalMatch} className="start-btn" disabled={!selectedMode || !selectedColor}>
              Start Game
            </button>
          </div>
        )}

        {gameStarted && !gameOverMessage && (
          <div className="game-layout">
            <div className="timers">
              <div className="timer white-timer"><strong>White:</strong> {Math.floor(whiteTime/60)}:{(whiteTime % 60).toString().padStart(2, "0")}</div>
              <div className="timer black-timer"><strong>Black:</strong> {Math.floor(blackTime/60)}:{(blackTime % 60).toString().padStart(2, "0")}</div>
            </div>

            <div className="turn-indicator">
              <p>{currentTurn === "w" ? "White's turn" : "Black's turn"}</p>
            </div>

            <div className="board-center">
              <Chessboard
                id="QuickMatchBoard"
                position={fen}
                onPieceDrop={onDrop}
                boardWidth={boardWidth}
                boardOrientation={currentTurn === "w" ? "white" : "black"}
                customDarkSquareStyle={{ backgroundColor: darkMode ? "#555" : "#0f94edff" }}
                customLightSquareStyle={{ backgroundColor: darkMode ? "#ccc" : "#f0eade" }}
              />
            </div>

            <div className="move-history">
              <h3>Move History</h3>
              <ol>{moveHistory.map((move, i) => <li key={i}>{i+1}. {move.san}</li>)}</ol>
              <button onClick={handleCopyMoves} className="icon-btn"><FaCopy /> Copy</button>
            </div>
          </div>
        )}

        {gameOverMessage && (
          <div className="game-over-modal">
            <div className="modal-content">
              <h2>{gameOverMessage}</h2>
              <button onClick={handleReset} className="start-btn">Play Again</button>
              <button onClick={handleBack} className="back-btn">Back to Dashboard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
