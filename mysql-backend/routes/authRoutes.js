const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/auth/google", authController.googleAuth);
router.post("/register-user", authController.registerUser);
router.get("/user/:email", authController.getUser);

// Standard Login Sync
router.post("/auth/login", authController.login);
router.post("/auth/register", authController.register);

module.exports = router;
