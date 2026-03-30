const express = require("express");
const axios = require("axios");

const router = express.Router();

router.post("/analyze", async (req, res) => {
    try {
        const { text } = req.body;

        const response = await axios.post(
            "https://router.huggingface.co/models/facebook/bart-large-mnli",
            {
                inputs: text,
                parameters: {
                    candidate_labels: ["emergency", "normal"],
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.HF_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        const data = response.data;

        const label = data.labels[0];
        const score = data.scores[0];

        let risk = "LOW";

        if (label === "emergency" && score > 0.7) {
            risk = "HIGH";
        }

        res.json({
            success: true,
            risk,
            confidence: score,
        });

    } catch (err) {
        console.log(err.response ? err.response.data : err.message);
        res.status(500).json({
            success: false,
            message: "AI error",
        });
    }
});

module.exports = router;