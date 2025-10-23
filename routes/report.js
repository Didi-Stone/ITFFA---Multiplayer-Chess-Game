const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report');
const authController = require('../controllers/auth');

router.post('/', authController.isLoggedIn, authController.reportUser);

module.exports = router