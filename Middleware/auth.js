const jwt = require('jsonwebtoken');
const MYSQL = require('mysql');
require('dotenv').config();

const db = MYSQL.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE
});

exports.isLoggedIn = (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) {
    console.log("No token found in cookies");
    return res.redirect('/Login');
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log("JWT verify error:", err);
      return res.redirect('/Login');
    }

    db.query('SELECT * FROM users WHERE id = ?', [decoded.id], (error, results) => {
      if (error) {
        console.log("DB error in isLoggedIn:", error);
        return res.redirect('/Login');
      }

      if (!results.length) {
        console.log("No user found in DB for decoded id:", decoded.id);
        return res.redirect('/Login');
      }

      console.log("User found in isLoggedIn:", results[0]); 
      req.user = results[0];
      next();
    });
  });
};
