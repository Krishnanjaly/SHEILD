const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");
const emergencyController = require("../controllers/emergencyController");
const activityController = require("../controllers/activityController");
const specialFeaturesController = require("../controllers/specialFeaturesController");

// User Profile related
router.post("/profile", profileController.storeProfile);
router.post("/hardware-trigger", profileController.storeHardwareTrigger);

// Emergency Workflow related
router.post("/emergency/start", emergencyController.startEmergency);
router.put("/emergency/end", emergencyController.endEmergency);
router.post("/emergency/audio", emergencyController.storeAudio);
router.post("/emergency/video", emergencyController.storeVideo);
router.post("/emergency/evidence", emergencyController.storeEvidence);
router.post("/emergency/alert", emergencyController.logAlert);
router.post("/emergency/call", emergencyController.logCall);
router.post("/trigger-emergency-protocol", emergencyController.triggerEmergencyProtocol);
router.get("/recordings/:email", emergencyController.getRecordingsByEmail);
router.delete("/delete-recording/:id", emergencyController.deleteRecording);
router.delete("/delete-cloudinary/:publicId", emergencyController.deleteCloudinaryAsset);

// Activity logging related
router.post("/activity/log", activityController.logActivity);
router.get("/activity/latest", activityController.getActivities);
router.delete("/activities/:email/:id", activityController.deleteActivityByEmail);
router.get("/activities/:email", activityController.getActivitiesByEmail);
router.delete("/activities/:email", activityController.clearActivitiesByEmail);
router.post("/notification", activityController.logNotification);

// Special Features related
router.post("/fake-call", specialFeaturesController.triggerFakeCall);
router.post("/access-link", specialFeaturesController.createAccessLink);
router.get("/generate-qr/:userId", specialFeaturesController.generateQrLink);
router.get("/qr-emergency", specialFeaturesController.renderQrEmergencyPage);
router.get("/qr_emergency", specialFeaturesController.renderQrEmergencyPage);
router.get("/qr emergency", specialFeaturesController.renderQrEmergencyPage);
router.post("/qr/trigger", specialFeaturesController.triggerQR);
router.post("/qr/trigger-public", specialFeaturesController.triggerQR);

module.exports = router;
