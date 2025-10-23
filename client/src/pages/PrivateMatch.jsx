import React, { useState, useEffect, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { io } from "socket.io-client";
import { FaChess, FaMoon, FaSun, FaCopy, FaArrowLeft } from "react-icons/fa";
import "../styles/PrivateMatch.css";

const socket = io("http://localhost:3000/private", { withCredentials: true });

export default function PrivateMatch({ user }) {
  const chessRef = useRef(new Chess());
  const containerRef = useRef(null);
  const chatEndRef = useRef(null);
  const [darkMode, setDarkMode] = useState(false);
  const [boardWidth, setBoardWidth] = useState(480);
  const [fen, setFen] = useState(chessRef.current.fen());
  const [moveHistory, setMoveHistory] = useState([]);
  const [currentTurn, setCurrentTurn] = useState("w");
  const [whiteTime, setWhiteTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [status, setStatus] = useState("");
  const [playerColor, setPlayerColor] = useState("white");
  const [selectedMode, setSelectedMode] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(4);

  const timeControls = { classic: 10 * 60, blitz: 5 * 60, bullet: 2 * 60 };

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
    if (!socket) return;

    const onRoomCreated = (code) => {
      setRoomCode(code);
      setIsCreator(true);
      setStatus("Room created. Waiting for opponent...");
    };

    const onRoomReady = ({ roomCode: code, white, black }) => {
      setRoomCode(code);
      setOpponentConnected(true);
      setStatus(`Opponent joined! ${white} vs ${black}`);
    };

    const onStartGame = ({ roomId, whitePlayer, blackPlayer, mode }) => {
      chessRef.current.reset();
      setFen(chessRef.current.fen());
      setMoveHistory([]);
      setCurrentTurn("w");
      setGameStarted(true);
      setGameOver(false);
      setWinner(null);

      const time = timeControls[mode] || 5 * 60;
      setWhiteTime(time);
      setBlackTime(time);
      setPlayerColor(whitePlayer === user.username ? "white" : "black");
      setStatus("Game started!");
    };

    const onOpponentMove = ({ from, to, promotion }) => {
      const move = chessRef.current.move({ from, to, promotion });
      if (move) {
        setFen(chessRef.current.fen());
        setMoveHistory([...chessRef.current.history()]);
        setCurrentTurn(chessRef.current.turn());
      }
    };

    const onChatMessage = ({ sender, message }) => {
      if (!isMuted) {
        setChatMessages((prev) => [...prev, { sender, message }]);
      }
    };

    const onGameOver = ({ winner: w, reason }) => {
      setGameOver(true);
      setWinner(w);
      setStatus(reason ? `Game over: ${reason}` : "Game over");
      setRedirectCountdown(3);
      setTimeout(() => window.location.replace("/"), 3000);
    };

    const onMatchSaved = ({ message }) => {
      console.log(message);
    };

    socket.on("room-created", onRoomCreated);
    socket.on("room-ready", onRoomReady);
    socket.on("startGame", onStartGame);
    socket.on("opponentMove", onOpponentMove);
    socket.on("chatMessage", onChatMessage);
    socket.on("gameOver", onGameOver);
    socket.on("matchSaved", onMatchSaved);

    return () => {
    socket.off("room-created", onRoomCreated);
    socket.off("room-ready", onRoomReady);
    socket.off("startGame", onStartGame);      
    socket.off("opponentMove", onOpponentMove);
    socket.off("chatMessage", onChatMessage);
    socket.off("gameOver", onGameOver);
    socket.off("matchSaved", onMatchSaved);
    };
  }, [user, isMuted]);

  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const timer = setInterval(() => {
      const turn = chessRef.current.turn();
      if (turn === "w") {
        setWhiteTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            socket.emit("timeout", { roomCode, winner: "black" });
            setGameOver(true);
            setWinner("black");
            return 0;
          }
          return prev - 1;
        });
      } else {
        setBlackTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            socket.emit("timeout", { roomCode, winner: "white" });
            setGameOver(true);
            setWinner("white");
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStarted, gameOver, roomCode]);
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!gameOver) return;
    const interval = setInterval(() => {
      setRedirectCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameOver]);

  const handleCreateRoom = () => {
    if (!user) return alert("You must be logged in!");
    setIsCreator(true);
    setStatus("Creating room...");
    socket.emit("create-room", { creator: { id: user.id, username: user.username } });
  };

  const handleJoinRoom = () => {
    if (!user) return alert("You must be logged in!");
    const code = (inputCode || "").trim().toUpperCase();
    if (!code) return setStatus("Please enter a valid room code.");
    socket.emit("join-room", { roomCode: code, player: { id: user.id, username: user.username } });
  };

  const handleStartGame = () => {
    if (!isCreator) return;
    if (!selectedMode) return alert("Please select a game mode.");
    socket.emit("start-game", { roomCode, mode: selectedMode });
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
    setMoveHistory([...chessRef.current.history()]);
    setCurrentTurn(chessRef.current.turn());

    socket.emit("move", { roomCode, from, to, promotion: "q" });
    return true;
  };

  const handleResign = () => {
    if (!roomCode) return;
    const opponent = chessRef.current.turn() === "w" ? "black" : "white"; 
    socket.emit("resign", { roomCode, username: user.username });
    setGameOver(true);
    setWinner(opponent);
    setStatus("You resigned");
};

  const sendMessage = () => {
    if (!chatInput.trim() || !roomCode) return;
    const msg = { sender: user.username, message: chatInput };
    socket.emit("chatMessage", { roomCode, ...msg });
    setChatInput("");
  };

  const handleMute = () => setIsMuted((s) => !s);
  const copyCode = async () => {
    if (!roomCode) return;
    await navigator.clipboard.writeText(roomCode);
    setStatus("Room code copied!");
  };
  const handleBack = () => window.location.replace("/");

  return (
    <div className={`private-match-container ${darkMode ? "dark" : ""}`} ref={containerRef}>
      <div className="top-bar">
        <div className="logo"><FaChess /> Private Match</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setDarkMode(p => !p)}>{darkMode ? <FaSun /> : <FaMoon />}</button>
          <button onClick={handleBack}><FaArrowLeft /> Back</button>
        </div>
      </div>

      {!roomCode && !gameStarted ? (
        <div className="create-join-section">
          <h3>Create Room</h3>
          <button onClick={handleCreateRoom}>Create Room</button>
          <h3>Join Room</h3>
          <input value={inputCode} onChange={e => setInputCode(e.target.value)} placeholder="Enter room code" />
          <button onClick={handleJoinRoom}>Join Room</button>
          <p>{status}</p>
        </div>
      ) : !gameStarted ? (
        <div style={{ textAlign: "center" }}>
          <h3>{isCreator ? "Waiting Room" : "Connected to Room"}</h3>
          <div>
            <span>{roomCode}</span> <FaCopy onClick={copyCode} />
          </div>
          <p>{status}</p>
          {isCreator && opponentConnected && (
            <div>
              <select value={selectedMode} onChange={e => setSelectedMode(e.target.value)}>
                <option value="">--Select Mode--</option>
                <option value="classic">Classic</option>
                <option value="blitz">Blitz</option>
                <option value="bullet">Bullet</option>
              </select>
              <button onClick={handleStartGame}>Start Game</button>
            </div>
          )}
        </div>
      ) : (
        <div className="game-layout">
          <div className="board-center">
            <div className="turn-indicator">
              <p>
                {currentTurn === "w" ? "White's turn" : "Black's turn"} — {playerColor[0] === currentTurn ? "Your move!" : "Waiting for opponent..."}
              </p>
              <button onClick={handleResign}>Resign</button>
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
              position={fen}
              onPieceDrop={(from, to) => onDrop(from, to)}
              boardWidth={boardWidth}
              boardOrientation={playerColor}
              arePiecesDraggable={!gameOver}
            />
          </div>
          <div className="move-history">
            <h3>Moves</h3>
            <ol>{moveHistory.map((m, i) => <li key={i}>{m}</li>)}</ol>
          </div>
          <div className="chat-box">
            <h3>Chat</h3>
            <div className="chat-messages">
              {chatMessages.map((msg, i) => (
                <div key={i}><strong>{msg.sender}:</strong> {msg.message}</div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
            />
            <button onClick={sendMessage}>Send</button>
            <button onClick={handleMute}>{isMuted ? "Unmute" : "Mute"}</button>
          </div>

          {gameOver && winner && (
            <div className="game-over-message">
              <h2>Game Over</h2>
              <p>Winner: {winner}</p>
              <p>Redirecting in {redirectCountdown} s...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
