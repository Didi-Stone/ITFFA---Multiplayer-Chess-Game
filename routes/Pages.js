const express = require('express');
const path = require('path');
const router = express.Router();
const { isLoggedIn } = require('../Middleware/auth');

router.get('/', isLoggedIn, (req, res) => { 
  console.log('Rendering index with user:', req.user);
  res.render('index', { user: req.user }); 
});

router.get('/Login', (req, res) => {
  res.render('Login-Register');  
});

router.get('/Forgot', (req, res) => {
  res.render('Forgot password');  
});

router.get('/profile', isLoggedIn, (req, res) => {
    if (!req.user) {
        return res.redirect('/Login');
    }
    res.render('Profile', { user: req.user });
});


module.exports = router;