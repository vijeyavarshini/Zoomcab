const db = require('./database');

/**
 * RATING & REVIEWS SERVICE
 * - Handles saving driver reviews
 * - Calculates driver average ratings
 */
class RatingService {
    /**
     * Submit a new review for a driver
     */
    async submitReview(reviewData) {
        const { rideId, riderId, driverId, rating, comment } = reviewData;

        if (rating < 1 || rating > 5) {
            throw new Error('Rating must be between 1 and 5');
        }

        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO reviews (ride_id, rider_id, driver_id, rating, comment) 
                         VALUES (?, ?, ?, ?, ?)`;
            db.run(sql, [rideId, riderId, driverId, rating, comment], function(err) {
                if (err) return reject(err);
                resolve({ id: this.lastID, ...reviewData });
            });
        });
    }

    /**
     * Get average rating and review count for a driver
     */
    async getDriverRating(driverId) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT AVG(rating) as avgRating, COUNT(id) as reviewCount 
                         FROM reviews WHERE driver_id = ?`;
            db.get(sql, [driverId], (err, row) => {
                if (err) return reject(err);
                resolve({
                    driverId,
                    averageRating: row.avgRating ? parseFloat(row.avgRating).toFixed(1) : 0,
                    totalReviews: row.reviewCount
                });
            });
        });
    }

    /**
     * Get recent reviews for a driver
     */
    async getRecentReviews(driverId, limit = 5) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT r.rating, r.comment, r.created_at, u.username as riderName 
                         FROM reviews r 
                         JOIN users u ON r.rider_id = u.id 
                         WHERE r.driver_id = ? 
                         ORDER BY r.created_at DESC LIMIT ?`;
            db.all(sql, [driverId, limit], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
}

module.exports = RatingService;
