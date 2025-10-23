const express = require("express");
const path = require("path");
const MYSQL = require("mysql");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { Chess } = require("chess.js");

dotenv.config({ path: "./.env" });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const db = MYSQL.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
});

db.connect((err) => {
  if (err) console.error("MySQL Connection Error:", err);
  else console.log("Connected to MySQL database.");
});

app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: ["http://localhost:5173"], credentials: true }));
app.use("/", require("./routes/Pages"));
app.use("/auth", require("./routes/auth"));
app.use("/matches", require("./routes/Matches")(db));
app.use(express.static(path.join(__dirname, "client/dist")));

app.get(["/quick-match", "/online-match", "/private-match","/match-history", "/match-replay/:matchId", "/leaderboard"], (req, res) => {
  res.sendFile(path.join(__dirname, "client/dist", "index.html"));
});

function calculateElo(rA, rB, resultA, K = 32) {
  const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const expectedB = 1 - expectedA;
  const newA = Math.round(rA + K * (resultA - expectedA));
  const newB = Math.round(rB + K * ((1 - resultA) - expectedB));
  return [newA, newB];
}

function saveMatchToDB(room, winnerUsername) {
  if (!room || !room.players || room.players.length < 2) {
    console.error("saveMatchToDB called with invalid room:", room);
    return;
  }

  const [white, black] = room.players;
  const whiteId = white?.id || null;
  const blackId = black?.id || null;
  const startTime = new Date(room.startTime || Date.now());
  const endTime = new Date();
  const finalFen = room.chess ? room.chess.fen() : null;

  const matchType = room.matchType || "online";
  const mode = room.mode || "classic";

  let winnerId = null;
  if (winnerUsername && winnerUsername !== "draw") {
    const winner = room.players.find(p => p.username === winnerUsername);
    winnerId = winner ? winner.id : null;
  }

  let eloChangeWhite = 0;
  let eloChangeBlack = 0;
  if (white?.elo && black?.elo && matchType !== "local") {
    const resultA = winnerId === whiteId ? 1 : winnerId === blackId ? 0 : 0.5;
    const [newWhiteElo, newBlackElo] = calculateElo(white.elo, black.elo, resultA);
    eloChangeWhite = newWhiteElo - white.elo;
    eloChangeBlack = newBlackElo - black.elo;

    db.query("UPDATE users SET elo_rating = ? WHERE id = ?", [newWhiteElo, whiteId]);
    db.query("UPDATE users SET elo_rating = ? WHERE id = ?", [newBlackElo, blackId]);
  }

  const insertMatchSql = `
    INSERT INTO matches (
      white_player_id, black_player_id, winner_id,
      mode, match_type, start_time, end_time,
      final_fen, elo_change_white, elo_change_black
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    insertMatchSql,
    [
      whiteId,
      blackId,
      winnerId,
      mode,
      matchType,
      startTime,
      endTime,
      finalFen,
      eloChangeWhite,
      eloChangeBlack,
    ],
    (err, result) => {
      if (err) {
        console.error("DB Error saving match:", err);
        return;
      }

      const matchId = result.insertId;
      console.log(`Match saved (ID: ${matchId})`);

      if (room.moves && room.moves.length > 0) {
        const moveSql = `
          INSERT INTO match_moves (match_id, move_number, move_notation, fen_after_move)
          VALUES ?
        `;
        const moveValues = room.moves.map((move, index) => [
          matchId,
          index + 1,
          move.san || `${move.from}-${move.to}`,
          move.after || null,
        ]);

        db.query(moveSql, [moveValues], (err2) => {
          if (err2) console.error("Error saving match moves:", err2);
          else console.log(`${room.moves.length} moves saved for match ${matchId}`);
        });
      } else {
        console.log("No moves recorded for this match.");
      }

      if (matchType !== "local") {
        const updates = [];

        if (winnerUsername === "draw" || !winnerId) {
          
          updates.push(["UPDATE users SET draws = draws + 1, total_games = total_games + 1 WHERE id = ?", [whiteId]]);
          updates.push(["UPDATE users SET draws = draws + 1, total_games = total_games + 1 WHERE id = ?", [blackId]]);
        } else if (winnerId === whiteId) {
          
          updates.push(["UPDATE users SET wins = wins + 1, total_games = total_games + 1, current_streak = current_streak + 1 WHERE id = ?", [whiteId]]);
          updates.push(["UPDATE users SET losses = losses + 1, total_games = total_games + 1, current_streak = 0 WHERE id = ?", [blackId]]);
        } else if (winnerId === blackId) {
          
          updates.push(["UPDATE users SET wins = wins + 1, total_games = total_games + 1, current_streak = current_streak + 1 WHERE id = ?", [blackId]]);
          updates.push(["UPDATE users SET losses = losses + 1, total_games = total_games + 1, current_streak = 0 WHERE id = ?", [whiteId]]);
        }

        for (const [sql, params] of updates) {
          db.query(sql, params, (err3) => {
            if (err3) console.error("Error updating user stats:", err3);
          });
        }

        console.log("User stats updated successfully.");
      }
    }
  );
}

function savePrivateMatch(db, room, winnerUsername) {
  if (!room || !room.players || room.players.length < 2) {
    console.error("savePrivateMatch called with invalid room:", room);
    return;
  }

  const [white, black] = room.players;
  const whiteId = white?.id || null;
  const blackId = black?.id || null;
  const startTime = new Date(room.startTime || Date.now());
  const endTime = new Date();
  const finalFen = room.chess ? room.chess.fen() : null;

  const matchType = "private"; 
  const mode = room.mode || "classic";

  let winnerId = null;
  if (winnerUsername && winnerUsername !== "draw") {
    const winner = room.players.find(p => p.username === winnerUsername);
    winnerId = winner ? winner.id : null;
  }

  const insertMatchSql = `
    INSERT INTO matches (
      white_player_id, black_player_id, winner_id,
      mode, match_type, start_time, end_time, final_fen
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    insertMatchSql,
    [whiteId, blackId, winnerId, mode, matchType, startTime, endTime, finalFen],
    (err, result) => {
      if (err) {
        console.error("DB Error saving private match:", err);
        return;
      }

      const matchId = result.insertId;
      console.log(`Private match saved (ID: ${matchId})`);

      if (room.moves && room.moves.length > 0) {
        const moveSql = `
          INSERT INTO match_moves (match_id, move_number, move_notation, fen_after_move)
          VALUES ?
        `;
        const moveValues = room.moves.map((move, index) => [
          matchId,
          index + 1,
          move.san || `${move.from}-${move.to}`,
          move.after || null,
        ]);

        db.query(moveSql, [moveValues], (err2) => {
          if (err2) console.error("Error saving private match moves:", err2);
          else console.log(`${room.moves.length} moves saved for private match ${matchId}`);
        });
      }
    }
  );
}

const onlineIO = io.of("/online");
const privateIO = io.of("/private");

const onlineWaitingPlayers = { classic: [], blitz: [], bullet: [] };
const onlineRooms = {};

onlineIO.on("connection", (socket) => {
  console.log(`Online player connected: ${socket.id}`);

  socket.on("findMatch", ({ player, mode, rated }) => {
    if (!player || !player.username || !player.id) return;

    const queue = onlineWaitingPlayers[mode] || [];
    if (queue.length > 0) {
      const waitingPlayer = queue.shift();
      const roomId = "room_" + Math.floor(Math.random() * 100000);

      socket.join(roomId);
      waitingPlayer.socket.join(roomId);

      onlineRooms[roomId] = {
        chess: new Chess(),
        players: [
          { ...waitingPlayer, color: "white" },
          { ...player, socket, color: "black" },
        ],
        moves: [],
        startTime: Date.now(),
        mode,
        rated,
        matchType: "online",
      };

      onlineIO.to(roomId).emit("startGame", {
        roomId,
        white: waitingPlayer.username,
        black: player.username,
        mode,
      });

      console.log(`Online match started: ${waitingPlayer.username} vs ${player.username} [${mode}]`);
    } else {
      queue.push({ ...player, socket });
      socket.emit("status", "Waiting for opponent...");
    }
    onlineWaitingPlayers[mode] = queue;
  });

  socket.on("move", ({ roomId, from, to, promotion, fenAfterMove, moveNotation }) => {
    const room = onlineRooms[roomId];
    if (!room) return;

    const move = room.chess.move({ from, to, promotion });
    if (!move) return;

    room.moves.push(move);
    room.moves[room.moves.length - 1].after = fenAfterMove || room.chess.fen();
    onlineIO.to(roomId).emit("opponentMove", move);

    if (room.chess.isGameOver()) {
      let winnerUsername = "draw";
      let reason = "draw";

      if (room.chess.isCheckmate()) {
        winnerUsername = room.chess.turn() === "w"
          ? room.players.find(p => p.color === "black").username
          : room.players.find(p => p.color === "white").username;
        reason = "checkmate";
      } else if (room.chess.isStalemate()) reason = "stalemate";
      else if (room.chess.isThreefoldRepetition()) reason = "threefold repetition";
      else if (room.chess.isInsufficientMaterial()) reason = "insufficient material";
      else if (room.chess.isDraw()) reason = "draw";

      onlineIO.to(roomId).emit("gameOver", {
        winner: winnerUsername,
        reason,
        finalFen: room.chess.fen(),
        moves: room.moves
      });

      saveMatchToDB(room, winnerUsername);

      setTimeout(() => delete onlineRooms[roomId], 3000);
    }
  });

  socket.on("chatMessage", ({ roomId, sender, message }) => {
    socket.to(roomId).emit("chatMessage", { sender, message });
  });

  socket.on("resign", ({ roomId, username }) => {
    const room = onlineRooms[roomId];
    if (!room) return;

    const winnerPlayer = room.players.find(p => p.username !== username);
    onlineIO.to(roomId).emit("gameOver", {
      winner: winnerPlayer.username,
      reason: "resignation",
      finalFen: room.chess.fen(),
      moves: room.moves
    });

    saveMatchToDB(room, winnerPlayer.username);
    setTimeout(() => delete onlineRooms[roomId], 5000);
  });

  socket.on("timeout", ({ roomId, winner }) => {
    const room = onlineRooms[roomId];
    if (!room) return;

    onlineIO.to(roomId).emit("gameOver", {
      winner,
      reason: "timeout",
      finalFen: room.chess.fen(),
      moves: room.moves
    });

    saveMatchToDB(room, winner);

    setTimeout(() => delete onlineRooms[roomId], 5000);
})

  socket.on("reportPlayer", ({ reporter, reported, reason }) => {
  if (!reporter || !reported || !reason) {
    socket.emit("reportError", { message: "Invalid report data." });
    return;
  }

  db.query(
    `SELECT id FROM user_reports
     WHERE reporter_id = (SELECT id FROM users WHERE username = ?)
       AND reported_id = (SELECT id FROM users WHERE username = ?)
       AND created_at >= NOW() - INTERVAL 1 HOUR`,
    [reporter, reported],
    (err, results) => {
      if (err) {
        console.error(err);
        return socket.emit("reportError", { message: "Database error." });
      }

      if (results.length > 0) {
        return socket.emit("reportError", { message: "You already reported this player recently." });
      }

      db.query(
        `INSERT INTO user_reports (reporter_id, reported_id, reason, created_at)
         VALUES (
           (SELECT id FROM users WHERE username = ?),
           (SELECT id FROM users WHERE username = ?),
           ?, NOW()
         )`,
        [reporter, reported, reason],
        (err2) => {
          if (err2) {
            console.error(err2);
            return socket.emit("reportError", { message: "Failed to submit report." });
          }

          db.query(
            `SELECT COUNT(*) AS reportCount FROM user_reports
             WHERE reported_id = (SELECT id FROM users WHERE username = ?)`,
            [reported],
            (err3, rows) => {
              if (err3) {
                console.error(err3);
                return socket.emit("reportError", { message: "Database error." });
              }

              const reportCount = rows[0].reportCount;

              if (reportCount >= 3) {
                db.query(
                  `UPDATE users SET banned_until = DATE_ADD(NOW(), INTERVAL 24 HOUR)
                   WHERE username = ?`,
                  [reported],
                  (err4) => {
                    if (err4) console.error(err4);
                    console.log(`${reported} has been temporarily banned for 24 hours.`);
                  }
                );
              }

              socket.emit("reportSuccess", { message: "Report submitted successfully." });
            }
          );
        }
      );
    }
  );
});

  socket.on("disconnect", () => {
    console.log(`Online player disconnected: ${socket.id}`);

    for (const mode in onlineWaitingPlayers) {
      onlineWaitingPlayers[mode] = onlineWaitingPlayers[mode].filter(p => p.socket.id !== socket.id);
    }

    for (const roomId in onlineRooms) {
      const room = onlineRooms[roomId];
      const playerLeft = room.players.find(p => p.socket.id === socket.id);
      if (playerLeft) {
        const winner = room.players.find(p => p.socket.id !== socket.id)?.username || "draw";
        onlineIO.to(roomId).emit("gameOver", {
          winner,
          reason: "disconnect",
          finalFen: room.chess.fen(),
          moves: room.moves
        });
        saveMatchToDB(room, winner);
        setTimeout(() => delete onlineRooms[roomId], 5000);
        break;
      }
    }
  });
});

const privateRooms = {};

privateIO.on("connection", (socket) => {
  console.log(`Private player connected: ${socket.id}`);

  socket.on("create-room", ({ creator }) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    privateRooms[roomCode] = {
      creator,
      players: [{ ...creator, socketId: socket.id, color: "white" }],
      chess: new Chess(),
      matchType: "private",
      moves: [],
    };

    socket.join(roomCode);
    socket.emit("room-created", roomCode);
    console.log(`Room created: ${roomCode} by ${creator.username}`);
  });

  socket.on("join-room", ({ roomCode, player }) => {
    const room = privateRooms[roomCode];
    if (!room) return socket.emit("status", "Room not found");

    room.players.push({ ...player, socketId: socket.id, color: "black" });
    room.matchType = "private"; 
    socket.join(roomCode);

    privateIO.to(roomCode).emit("room-ready", {
      roomCode,
      white: room.players[0].username,
      black: room.players[1].username,
    });
  });

  socket.on("start-game", ({ roomCode, mode }) => {
    const room = privateRooms[roomCode];
    if (!room) return;
    room.mode = mode;

    privateIO.to(roomCode).emit("startGame", {
      roomId: roomCode,
      whitePlayer: room.players[0].username,
      blackPlayer: room.players[1]?.username || null,
      mode,
    });
  });

  socket.on("move", ({ roomCode, from, to, promotion }) => {
    const room = privateRooms[roomCode];
    if (!room) return;

    const move = room.chess.move({ from, to, promotion });
    if (!move) return;

    room.moves.push(move);
    privateIO.to(roomCode).emit("opponentMove", { from, to, promotion });

    if (room.chess.isGameOver()) {
      let winner = "draw";
      if (room.chess.isCheckmate()) {
        winner =
          room.chess.turn() === "w"
            ? room.players.find((p) => p.color === "black").username
            : room.players.find((p) => p.color === "white").username;
      }

      privateIO.to(roomCode).emit("gameOver", { winner });

      saveMatchToDB(room, winner)
        .then(() => {
          privateIO.to(roomCode).emit("matchSaved", {
            winner,
            message: "Match saved to history!",
          });
          console.log(`Match ${roomCode} saved successfully`);
        })
        .catch((err) => console.error("Error saving match:", err))
        .finally(() => {
          delete privateRooms[roomCode];
        });
    }
  });

  socket.on("timeout", async ({ roomCode, winner }) => {
  const room = privateRooms[roomCode];
  if (!room) return;

  try {
    privateIO.to(roomCode).emit("gameOver", {
      winner,
      reason: "time out",
    });

    if (typeof saveMatchToDB === "function") {
      await saveMatchToDB(room, winner);
      privateIO.to(roomCode).emit("matchSaved", {
        winner,
        message: "Match saved to history!",
      });
      console.log(`Match ${roomCode} saved successfully`);
    } else {
      console.error("saveMatchToDB is not defined or not a function");
    }

  } catch (err) {
    console.error("Error saving match after timeout:", err);
  } finally {
    delete privateRooms[roomCode];
  }
});

  socket.on("resign", ({ roomCode, username }) => {
    const room = privateRooms[roomCode];
    if (!room) return;
    const winner = room.players.find((p) => p.username !== username);
    privateIO.to(roomCode).emit("gameOver", {
      winner: winner.username,
      reason: "resignation",
    });
    saveMatchToDB(room, winner.username);
    delete privateRooms[roomCode];
  });

  socket.on("chatMessage", ({ roomCode, sender, message }) => {
    const room = privateRooms[roomCode];
    if (!room) {
      console.warn(`Chat ignored — room ${roomCode} not found`);
      return;
    }
  
    privateIO.to(roomCode).emit("chatMessage", { sender, message });
  });

  socket.on("disconnect", () => {
    console.log(`Private player disconnected: ${socket.id}`);

    for (const code in privateRooms) {
      const room = privateRooms[code];
      if (!room) continue;

      const disconnected = room.players.find((p) => p.socketId === socket.id);
      if (disconnected) {
        const winner = room.players.find((p) => p.socketId !== socket.id);
        const winnerName = winner ? winner.username : null;

        if (winnerName) {
          privateIO.to(code).emit("gameOver", {
            winner: winnerName,
            reason: "disconnect",
          });
          saveMatchToDB(room, winnerName);
        }

        delete privateRooms[code];
        break;
      }
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
