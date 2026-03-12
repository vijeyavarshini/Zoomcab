const express = require('express');
const router = express.Router();

module.exports = (ratingService) => {
    // Submit a new review
    router.post('/submit', async (req, res) => {
        try {
            const result = await ratingService.submitReview(req.body);
            res.json({ message: 'Review submitted successfully', review: result });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    // Get driver ratings and reviews
    router.get('/driver/:driverId', async (req, res) => {
        try {
            const stats = await ratingService.getDriverRating(req.params.driverId);
            const reviews = await ratingService.getRecentReviews(req.params.driverId);
            res.json({ stats, recentReviews: reviews });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
