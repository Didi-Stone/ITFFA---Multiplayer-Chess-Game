module.exports = (db) => {
  const router = require("express").Router();
  const { isLoggedIn } = require("../Middleware/auth");

  router.post("/save", isLoggedIn, (req, res) => {
  try {
    const {
      winner,
      mode,
      type,
      moves,
      local_user_color, 
    } = req.body;

    const userId = req.user.id;
    const startTime = new Date();
    const endTime = new Date();
    const finalFen = moves.length ? moves[moves.length - 1].fen_after_move : "";

    let whiteId = null;
    let blackId = null;

    if (type === "local") {
      if (local_user_color === "white") whiteId = userId;
      else blackId = userId;
    } else {

      whiteId = req.body.whiteId || null;
      blackId = req.body.blackId || null;
    }

    let winnerId = null;
    if (type !== "local") {
      if (winner === "white") winnerId = whiteId;
      else if (winner === "black") winnerId = blackId;
    } else {
      if (winner === local_user_color) winnerId = userId;
    }

    const matchSql = `
      INSERT INTO matches (
        white_player_id,
        black_player_id,
        winner_id,
        mode,
        match_type,
        local_user_color,
        start_time,
        end_time,
        final_fen,
        elo_change_white,
        elo_change_black
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const matchValues = [
      whiteId,
      blackId,
      winnerId,
      mode,
      type,
      type === "local" ? local_user_color : null,
      startTime,
      endTime,
      finalFen,
      0,
      0,
    ];

    db.query(matchSql, matchValues, (err, result) => {
      if (err) {
        console.error("MATCH INSERT ERROR:", err);
        return res.status(500).json({ error: err });
      }

      const matchId = result.insertId;

      if (moves && moves.length) {
        const moveSql = `
          INSERT INTO match_moves (
            match_id,
            move_number,
            move_notation,
            fen_after_move,
            created_at
          ) VALUES ?
        `;
        const moveValues = moves.map((m, i) => [
          matchId,
          i + 1,
          m.san || m,
          m.fen_after_move || "",
          new Date(),
        ]);

        db.query(moveSql, [moveValues], (err2) => {
          if (err2) console.error("Failed to insert moves:", err2);
        });
      }

      res.json({ success: true, matchId });
    });
  } catch (error) {
    console.error("Error saving match:", error);
    res.status(500).json({ error: "Server error" });
  }
});

  router.get("/history", isLoggedIn, (req, res) => {
    const userId = req.user.id;

    const sql = `
      SELECT 
        m.id,
        m.white_player_id,
        wu.username AS white_username,
        m.black_player_id,
        bu.username AS black_username,
        m.winner_id,
        w.username AS winner_username,
        m.mode,
        m.match_type,
        m.local_user_color,
        m.start_time,
        m.end_time,
        m.final_fen
      FROM matches m
      LEFT JOIN users wu ON m.white_player_id = wu.id
      LEFT JOIN users bu ON m.black_player_id = bu.id
      LEFT JOIN users w ON m.winner_id = w.id
      WHERE m.white_player_id = ? OR m.black_player_id = ?
      ORDER BY m.end_time DESC
    `;

    db.query(sql, [userId, userId], (err, results) => {
      if (err) {
        console.error("Error fetching match history:", err);
        return res.status(500).json({ error: "Failed to fetch match history" });
      }
      res.json({ matches: results });
    });
  });

router.get("/replay/:matchId", isLoggedIn, (req, res) => {
  const matchId = req.params.matchId;
  const userId = req.user.id;

  const sql = `
    SELECT 
      m.id,
      m.mode,
      m.match_type,
      m.local_user_color,
      wu.username AS white_username,
      bu.username AS black_username,
      w.username AS winner_username
    FROM matches m
    LEFT JOIN users wu ON m.white_player_id = wu.id
    LEFT JOIN users bu ON m.black_player_id = bu.id
    LEFT JOIN users w ON m.winner_id = w.id
    WHERE m.id = ? AND (m.white_player_id = ? OR m.black_player_id = ?)
  `;

  db.query(sql, [matchId, userId, userId], (err, matchResults) => {
    if (err) {
      console.error("Error fetching match:", err);
      return res.status(500).json({ error: "Failed to fetch match" });
    }

    if (!matchResults.length) {
      return res.status(404).json({ error: "Match not found" });
    }

    const moveSql = `
      SELECT move_number, move_notation, fen_after_move, created_at
      FROM match_moves
      WHERE match_id = ?
      ORDER BY move_number ASC
    `;

    db.query(moveSql, [matchId], (err2, moveResults) => {
      if (err2) {
        console.error("Error fetching moves:", err2);
        return res.status(500).json({ error: "Failed to fetch moves" });
      }

      res.json({
        match: matchResults[0],
        moves: moveResults,
      });
    });
  });
});

router.get("/leaderboard", isLoggedIn, (req, res) => {
  const period = req.query.period || "all";

  let sql = `
    SELECT id, username, elo_rating, wins, losses
    FROM users
    ORDER BY elo_rating DESC
    LIMIT 50
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Leaderboard query error:", err);
      return res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
    res.json({ players: results });
  });
});

  return router;
};
