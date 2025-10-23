import React, { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { io } from "socket.io-client";
import '../styles/OnlineMatch.css';

import { FaMoon, FaSun, FaChessKnight } from "react-icons/fa";

const socket = io("http://localhost:3000/online", { withCredentials: true });

export default function OnlineMatch({ user }) {
  const chessRef = useRef(new Chess());
  const containerRef = useRef(null);
  const [fen, setFen] = useState(chessRef.current.fen());
  const [currentTurn, setCurrentTurn] = useState("w");
  const [boardWidth, setBoardWidth] = useState(480);
  const [moveHistory, setMoveHistory] = useState([]);
  const [roomId, setRoomId] = useState("");
  const [playerColor, setPlayerColor] = useState("white");
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [selectedMode, setSelectedMode] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [whiteTime, setWhiteTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isMuted, setIsMuted] = useState(false);

  const timeControls = {
    classic: 10 * 60,
    blitz: 5 * 60,
    bullet: 2 * 60,
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const computeSize = (containerWidth) => {
      const maxBoard = 700;
      const paddingV = 160;
      const availHeight = Math.max(window.innerHeight - paddingV, 200);
      return Math.floor(Math.min(containerWidth, availHeight, maxBoard));
    };

    setBoardWidth(computeSize(el.clientWidth));

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setBoardWidth(computeSize(entry.contentRect.width));
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!user) return;

   const handleStartGame = ({ roomId, white, black, mode }) => {
      setRoomId(roomId);
      setPlayerColor(white === user.username ? "white" : "black");
      chessRef.current.whitePlayer = white;
      chessRef.current.blackPlayer = black; 
      setGameStarted(true);
      setWaiting(false);
      setGameOver(false);
      setWinner(null);
      setWhiteTime(timeControls[mode]);
      setBlackTime(timeControls[mode]);
      chessRef.current.reset();
      setFen(chessRef.current.fen());
      setMoveHistory([]);
      console.log(`Game started: ${white} vs ${black} [${mode}]`);
    };

    const handleOpponentMove = (move) => {
      const result = chessRef.current.move(move);
      if (!result) return;
      setFen(chessRef.current.fen());
      setCurrentTurn(chessRef.current.turn());
      setMoveHistory([...chessRef.current.history()]);
    };

    const handleGameOver = ({ winner, reason }) => {
      setGameOver(true);
      setWinner(winner);
      alert(`Game Over! Winner: ${winner} ${reason ? `(${reason})` : ""}`);
      setTimeout(() => window.location.replace("/"), 2000);
    };

    socket.on("startGame", handleStartGame);
    socket.on("opponentMove", handleOpponentMove);
    socket.on("gameOver", handleGameOver);
    socket.on("playerResigned", handleGameOver);

    return () => {
      socket.off("startGame", handleStartGame);
      socket.off("opponentMove", handleOpponentMove);
      socket.off("gameOver", handleGameOver);
      socket.off("playerResigned", handleGameOver);
    };
  }, [user]);

  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const timer = setInterval(() => {
      const turn = chessRef.current.turn();
      if (turn === "w") {
        setWhiteTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            socket.emit("timeout", { roomId, winner: "black" });
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            socket.emit("timeout", { roomId, winner: "white" });
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStarted, gameOver, currentTurn]);

  const chatEndRef = useRef(null);
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  useEffect(() => {
    socket.on("chatMessage", ({ sender, message }) => {
      if (!isMuted) {
        setChatMessages((prev) => [...prev, { sender, message }]);
      }
    });
    return () => socket.off("chatMessage");
  }, [isMuted]);

  const handleStartMatch = () => {
    if (!user) {
      alert("You must be logged in to start a match!");
      return;
    }
    if (!selectedMode) {
      alert("Please select a game mode first!");
      return;
    }

    setWaiting(true);
    socket.emit("findMatch", {
      player: {
        id: user.id,
        username: user.username,
        elo: user.elo_rating || 1200,
      },
      mode: selectedMode,
      rated: false,
    });
  };

  const onDrop = (from, to) => {
    if (!gameStarted || gameOver) return false;
    const isWhiteTurn = chessRef.current.turn() === "w";
    if ((isWhiteTurn && playerColor !== "white") || (!isWhiteTurn && playerColor !== "black")) {
      alert("It's not your turn!");
      return false;
    }

    const move = chessRef.current.move({ from, to, promotion: "q" });
    if (!move) return false;

    setFen(chessRef.current.fen());
    setCurrentTurn(chessRef.current.turn());
    setMoveHistory([...chessRef.current.history()]);
    socket.emit("move", { roomId, from, to, promotion: "q", fenAfterMove: chessRef.current.fen(), moveNotation: move.san,});

    return true;
  };

  const handleResign = () => {
    if (!roomId || !user) return;
    socket.emit("resign", { roomId, username: user.username });
  };

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    socket.emit("chatMessage", { roomId, sender: user.username, message: chatInput });
    setChatMessages((prev) => [...prev, { sender: "You", message: chatInput }]);
    setChatInput("");
  };
  const handleReport = () => {
  if (!roomId || !user) return;

  const reason = prompt("Please describe the issue (e.g. cheating, harassment, spam):");
  if (!reason || reason.trim() === "") {
    alert("Report cancelled — reason required.");
    return;
  }

  const opponentName = playerColor === "white"
    ? chessRef.current.blackPlayer
    : chessRef.current.whitePlayer;

  if (!opponentName) {
    alert("Opponent information not found. Cannot submit report.");
    return;
  }

  socket.emit("reportPlayer", {
    roomId,
    reporter: user.username,
    reported: opponentName,
    reason,
  });

  alert("Your report has been submitted. Thank you.");
};

  const handleMute = () => setIsMuted((prev) => !prev);
  
  const handleBack = () => window.location.replace("/");
  const toggleTheme = () => setDarkMode((prev) => !prev);

  return (
    <div className={`online-match-page ${darkMode ? "dark" : "light"}`}>
      <div className="online-match-wrapper" ref={containerRef}>
        <nav className="board-nav">
          <div className="nav-left">
            <button onClick={handleBack} className="back-btn">Back to Dashboard</button>
            <h2><FaChessKnight className="chess-icon" /> Online Match</h2>
          </div>
          <div className="nav-right">
            <button className="theme-toggle" onClick={toggleTheme}>
              {darkMode ? <FaSun /> : <FaMoon />}
            </button>
            <button onClick={handleReport}>Report</button>
            {gameStarted && <button onClick={handleResign} className="resign-btn">Resign</button>}
          </div>
        </nav>

        {!gameStarted && !waiting && (
          <div className="mode-selection">
            <h3>Select Game Mode</h3>
            <select value={selectedMode} onChange={(e) => setSelectedMode(e.target.value)}>
              <option value="">-- Choose Mode --</option>
              <option value="classic">Classic (10 min)</option>
              <option value="blitz">Blitz (5 min)</option>
              <option value="bullet">Bullet (2 min)</option>
            </select>
            <button onClick={handleStartMatch} className="start-btn" disabled={!selectedMode || !user}>
              Start Match
            </button>
          </div>
        )}

        {waiting && !gameStarted && (
          <div className="waiting-screen">
            <h2>Searching for opponent in {selectedMode} mode...</h2>
            <p>Please wait while we find someone with the same mode.</p>
          </div>
        )}

        {gameStarted && (
          <div className="game-layout">
            <div className="board-center">
              <div className="turn-indicator">
                <p>
                  {currentTurn === "w" ? "White's turn" : "Black's turn"} — {playerColor[0] === currentTurn ? "Your move!" : "Waiting for opponent..."}
                </p>
              </div>
              <div className="timers">
                <div className="timer white-timer">
                  <strong>White:</strong> {Math.floor(whiteTime / 60)}:{(whiteTime % 60).toString().padStart(2, "0")}
                </div>
                <div className="timer black-timer">
                  <strong>Black:</strong> {Math.floor(blackTime / 60)}:{(blackTime % 60).toString().padStart(2, "0")}
                </div>
              </div>

              <Chessboard
                id="OnlineMatchBoard"
                position={fen}
                onPieceDrop={onDrop}
                boardWidth={boardWidth}
                boardOrientation={playerColor}
                arePiecesDraggable={!gameOver}
              />
            </div>

            <div className="move-history">
              <h3>Move History</h3>
              <ol>{moveHistory.map((m, i) => <li key={i}>{m}</li>)}</ol>
            </div>

            <div className="chat-box">
              <h3>Chat</h3>
              <div className="chat-messages">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={msg.sender === "You" ? "message own" : "message opponent"}>
                    <strong>{msg.sender}:</strong> {msg.message}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input">
                <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                       placeholder="Type a message..." onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
                <button onClick={sendMessage}>Send</button>
                <button onClick={handleMute}>{isMuted ? "Unmute" : "Mute"}</button>
                
              </div>
            </div>

            {gameOver && winner && (
              <div className="game-over-message">
                <h2>Game Over</h2>
                <p>Winner: {winner}</p>
                <p>Redirecting to dashboard...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
