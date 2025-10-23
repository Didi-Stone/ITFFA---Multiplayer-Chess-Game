const MYSQL = require('mysql');
const password = require('password-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); 

var schema = new password();
schema.is().min(6)                                    
.has().uppercase()                              
.has().lowercase()                              
.has().digits()                                
.has().not()                               
.spaces();                                     

const db = MYSQL.createConnection({
  host: process.env.DATABASE_HOST, 
  user: process.env.DATABASE_USER, 
  password: process.env.DATABASE_PASSWORD, 
  database: process.env.DATABASE 
});

exports.register = (req, res) => {
    console.log(req.body);
    const name = req.body.Username;
    const email = req.body.Email;
    const password = req.body.Password;

    db.query('SELECT email FROM users WHERE email = ?', [email], (error, results) => {
        if (error) {
            console.log(error);
            return res.render('Login-Register', {
                message: 'Database error during email check',
                messageType: 'error'
            });
        }

        if (results.length > 0) {
            return res.render('Login-Register', {
                message: 'That email is already in use',
                messageType: 'error'
            });
        }

        if (!schema.validate(password)) {
            return res.render('Login-Register', {
                message: 'Password must be at least 6 characters long, contain uppercase and lowercase letters, digits, and no spaces.',
                messageType: 'error'
            });
        }

        db.query('SELECT username FROM users WHERE username = ?', [name], (err, userResults) => {
            if (err) {
                console.log(err);
                return res.render('Login-Register', {
                    message: 'Database error during username check',
                    messageType: 'error'
                });
            }

            if (userResults.length > 0) {
                return res.render('Login-Register', {
                    message: 'That username is already taken',
                    messageType: 'error'
                });
            }

            bcrypt.hash(password, 8, (hashErr, hashedPassword) => {
                if (hashErr) {
                    console.log(hashErr);
                    return res.render('Login-Register', {
                        message: 'Error hashing password',
                        messageType: 'error'
                    });
                }

                db.query('INSERT INTO users SET ?', { username: name, email: email, password_hash: hashedPassword }, (insertErr, insertResults) => {
                    if (insertErr) {
                        console.log(insertErr);
                        return res.render('Login-Register', {
                            message: 'Error registering user',
                            messageType: 'error'
                        });
                    }

                    console.log(insertResults);
                    return res.render('Login-Register', {
                        message: 'User registered successfully',
                        messageType: 'success'
                    });
                });
            });
        });
    });
};

exports.login = (req, res) => {
    const username = req.body.Username;
    const password = req.body.Password;

    if (!username || !password) {
        return res.status(400).render('Login-Register', {
            message: 'Please provide a Username and Password',
            messageType: 'error'
        });
    }

    db.query('SELECT * FROM users WHERE username = ?', [username], (error, results) => {
        if (error) {
            console.error("Database error:", error);
            return res.status(500).render('Login-Register', {
                message: 'Database error',
                messageType: 'error'
            });
        }

        if (!results || results.length === 0) {
            return res.status(401).render('Login-Register', {
                message: 'Username or Password is incorrect',
                messageType: 'error'
            });
        }

        const user = results[0];

        bcrypt.compare(password, user.password_hash)
            .then(isMatch => {
                if (!isMatch) {
                    return res.status(401).render('Login-Register', {
                        message: 'Username or Password is incorrect',
                        messageType: 'error'
                    });
                }

                if (user.is_banned && user.ban_until) {
                    const now = new Date();
                    const banUntil = new Date(user.ban_until);
                    if (now >= banUntil) {
                        db.query(
                            "UPDATE users SET is_banned = 0, ban_until = NULL WHERE id = ?",
                            [user.id],
                            (err) => {
                                if (err) console.error("Failed to unban user:", err);
                            }
                        );
                        user.is_banned = 0;
                    }
                }

                if (user.is_banned) {
                    return res.render("Login-Register", {
                        message: `Your account is banned until ${new Date(user.ban_until).toLocaleString()}`,
                        messageType: "error"
                    });
                }

                const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
                    expiresIn: process.env.JWT_EXPIRES_IN
                });

                const cookieOptions = {
                    expires: new Date(
                        Date.now() + process.env.JWT_COOKIE_EXPIRES * 24 * 60 * 60 * 1000
                    ),
                    httpOnly: true
                };

                res.cookie('jwt', token, cookieOptions);
                res.status(200).redirect('/');
            })
            .catch(err => {
                console.error("Bcrypt compare error:", err);
                return res.status(500).render('Login-Register', {
                    message: 'Server error during login',
                    messageType: 'error'
                });
            });
    });
};


exports.isLoggedIn = (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) return res.redirect('/Login');

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.redirect('/Login');

    db.query('SELECT * FROM users WHERE id = ?', [decoded.id], (error, results) => {
      if (error || !results.length) return res.redirect('/Login');
      req.user = results[0]; 
      next();
    });
    localStorage.setItem("user", JSON.stringify(userData));
  });
};

exports.reportUser = (req, res) => {
    const reporterId = req.user.id;
    const { reportedId, reason } = req.body;

    if (!reportedId || !reason) {
        return res.status(400).json({ message: "Please provide user and reason" });
    }

    const insertQuery = `
        INSERT INTO user_reports (reporter_id, reported_id, reason, created_at)
        VALUES (?, ?, ?, NOW())
    `;

    db.query(insertQuery, [reporterId, reportedId, reason], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "Database error" });
        }

        const countQuery = `SELECT COUNT(*) AS reportCount FROM user_reports WHERE reported_id = ?`;
        db.query(countQuery, [reportedId], (err2, results) => {
            if (err2) {
                console.error(err2);
                return res.status(500).json({ message: "Database error" });
            }

            const reportCount = results[0].reportCount;

            if (reportCount >= 3) {
                const banUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
                const banQuery = `
                    UPDATE users 
                    SET is_banned = 1, ban_until = ? 
                    WHERE id = ?
                `;
                db.query(banQuery, [banUntil, reportedId], (err3) => {
                    if (err3) {
                        console.error(err3);
                        return res.status(500).json({ message: "Failed to ban user" });
                    }
                    return res.status(200).json({ message: "User has been reported and temporarily banned for 24 hours" });
                });
            } else {
                return res.status(200).json({ message: "User has been reported" });
            }
        });
    });
};

exports.forgotPassword = (req, res) => {
    
    const email = req.body.email;

  if (!email) {
    return res.render("Forgot password", {
      message: "Please provide your email",
      messageType: "error"
    });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error(err);
      return res.render("Forgot password", {
        message: "Database error. Please try again.",
        messageType: "error"
      });
    }

    if (results.length === 0) {
      return res.render("Forgot password", {
        message: "No account found with that email",
        messageType: "error"
      });
    }

    const userId = results[0].id;

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000); 
  
   db.query('DELETE FROM password_resets WHERE user_id = ?', [userId], () => { 
    db.query(
      "INSERT INTO password_resets (user_id, reset_token, expires_at) VALUES (?, ?, ?)",
      [userId, token, expires],
      (insertErr) => {
        if (insertErr) {
          console.error(insertErr);
          return res.render("Forgot password", {
            message: "Failed to generate reset token. Try again later.",
            messageType: "error"
          });
        }

        const resetURL = `http://localhost:3000/auth/Reset?token=${token}&id=${userId}`;

        const transporter = nodemailer.createTransport({// Set up email transporter
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT,
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          }
        });

        const mailOptions = {
          from: `"Chess Game" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: "Password Reset Request",
          html: `<p>You requested a password reset.</p>
                 <p>Click the link below to reset your password. This link expires in 1 hour:</p>
                 <a href="${resetURL}">${resetURL}</a>`
        };

        transporter.sendMail(mailOptions, (emailErr, info) => {
          if (emailErr) {
            console.error(emailErr);
            return res.render("Forgot password", {
              message: "Failed to send email. Try again later.",
              messageType: "error"
            });
          }

          console.log("RESET LINK:", resetURL); // for debugging in terminal
          return res.render("Forgot password", {
            message: "Password reset link sent to your email.",
            messageType: "success"
          });
        });
      });
    });
  });
};

exports.showResetForm = (req, res) => {
    const { token, id } = req.query;

    db.query(
        "SELECT * FROM password_resets WHERE user_id = ? AND reset_token = ? AND expires_at > NOW()",
        [id, token],
        (err, results) => {
            if (err) throw err;

            if (results.length === 0) {
                return res.status(400).send("Invalid or expired reset link.");
            }
            res.render("Reset", { token, id });
        }
    );
}

exports.resetPassword = async (req, res) => {
 const { token, id, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.render("Reset", {
        token,
        id,
        message: "Passwords do not match",
        messageType: "error"
        });
    }

    if (!schema.validate(password)) {
        return res.render("Reset", {
        token,
        id,
        message: "Password must be at least 6 characters, contain uppercase, lowercase, digits, and no spaces",
        messageType: "error"
        });
    }

    db.query("SELECT * FROM users WHERE id = ?", [id], async (err, results) => {
        if (err) {
        console.error(err);
        return res.render("Reset", {
            token,
            id,
            message: "Something went wrong. Please try again.",
            messageType: "error"
        });
        }

        if (results.length === 0) {
        return res.render("Reset", {
            token,
            id,
            message: "Invalid user. Please try again.",
            messageType: "error"
        });
        }

        const user = results[0];
        const isSame = await bcrypt.compare(password, user.password_hash);

        if (isSame) {
        return res.render("Reset", {
            token,
            id,
            message: "New password cannot be the same as the old one.",
            messageType: "error"
        });
        }

        const hashedPassword = await bcrypt.hash(password, 8);

        db.query(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        [hashedPassword, id],
        (updateErr) => {
            if (updateErr) {
            console.error(updateErr);
            return res.render("Reset", {
                token,
                id,
                message: "Failed to reset password. Try again later.",
                messageType: "error"
            });
            }
            return res.redirect("/Login");
        }
        );
    });
};

exports.updateProfile = (req, res) => {
    
    const { username, email } = req.body;
    const userId = req.user.id;

    db.query('UPDATE users SET username = ?, email = ? WHERE id = ?', 
        [username, email, userId], 
        (err) => {
            if (err) {
                console.error(err);
                return res.render('Profile', { 
                    user: req.user,
                    message: 'Failed to update profile', 
                    messageType: 'error' 
                });
            }

            db.query('SELECT * FROM users WHERE id = ?', [userId], (err2, results) => {
                if (err2) throw err2;
                res.render('Profile', { 
                    user: results[0],
                    message: 'Profile updated successfully', 
                    messageType: 'success' 
                });
            });
        }
    );
};

exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const userId = req.user.id;

    if (newPassword !== confirmNewPassword) {
        return res.render('Profile', { 
            user: req.user,
            message: 'New passwords do not match',
            messageType: 'error'
        });
    }

    if (!schema.validate(newPassword)) {
        return res.render('Profile', { 
            user: req.user,
            message: 'New password must meet security requirements',
            messageType: 'error'
        });
    }

    db.query('SELECT password_hash FROM users WHERE id = ?', [userId], async (err, results) => {
        if (err) throw err;

        const isMatch = await bcrypt.compare(currentPassword, results[0].password_hash);
        if (!isMatch) {
            return res.render('Profile', { 
                user: req.user,
                message: 'Current password is incorrect',
                messageType: 'error'
            });
        }
    
        const hashedPassword = await bcrypt.hash(newPassword, 8);
    
        db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, userId], (err2) => {
            if (err2) throw err2;
            res.render('Profile', { 
                user: req.user,
                message: 'Password changed successfully',
                messageType: 'success'
            });
        });
    });
};


