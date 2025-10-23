const express = require('express');
const authController = require('../controllers/auth');
const router = express.Router();
const { isLoggedIn } = require('../Middleware/auth');

router.post('/login', authController.login);

router.post('/register', authController.register);

router.post('/Forgot', authController.forgotPassword);

router.get('/Reset', authController.showResetForm);

router.post('/Reset', authController.resetPassword);

router.get('/', authController.isLoggedIn, (req, res) => {
  console.log("REQ.USER IN DASHBOARD:", req.user);   
  if (!req.user) {
    console.log("No req.user, redirecting to login...");
    return res.redirect('/Login');
  }
  res.render('index', { user: req.user });
});

router.get('/logout', (req, res) => {
  res.clearCookie('jwt');
  console.log('User logged out, JWT cookie cleared');
  res.redirect('/Login'); 
});

router.get('/profile', isLoggedIn, (req, res) => {
    if (!req.user) {
        return res.redirect('/Login');
    }res.render('Profile', { user: req.user });
});

router.post('/update-profile', isLoggedIn, authController.updateProfile);

router.post('/change-password', isLoggedIn, authController.changePassword);

router.get('/me', isLoggedIn, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({ user: req.user });
});

router.post("/report",  isLoggedIn, authController.reportUser);


module.exports = router;
