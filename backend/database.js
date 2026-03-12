const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'zoomcab.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database ' + dbPath + ': ' + err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT CHECK(role IN ('rider', 'driver')),
            loyalty_points INTEGER DEFAULT 0
        )`, (err) => {
            if (err) {
                // Table already created
            } else {
                // Insert default users
                const insert = 'INSERT OR IGNORE INTO users (username, password, role, loyalty_points) VALUES (?,?,?,?)';
                db.run(insert, ["Guru", bcrypt.hashSync("123456", 10), "rider", 0]);
                db.run(insert, ["Driver1", bcrypt.hashSync("password", 10), "driver", 0]);
            }
            
            // Migration for existing table
            db.run(`ALTER TABLE users ADD COLUMN loyalty_points INTEGER DEFAULT 0`, (alterErr) => {
                // Ignore error if column already exists
            });
        });

        // Drivers table (extra details for drivers)
        db.run(`CREATE TABLE IF NOT EXISTS drivers (
            user_id INTEGER PRIMARY KEY,
            status TEXT DEFAULT 'offline',
            latitude REAL,
            longitude REAL,
            vehicle_type TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Rides table
        db.run(`CREATE TABLE IF NOT EXISTS rides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rider_id INTEGER,
            driver_id INTEGER,
            pickup_lat REAL,
            pickup_lng REAL,
            dropoff_lat REAL,
            dropoff_lng REAL,
            pickup_address TEXT,
            dropoff_address TEXT,
            status TEXT DEFAULT 'pending',
            fare REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            vehicle_type TEXT,
            FOREIGN KEY(rider_id) REFERENCES users(id),
            FOREIGN KEY(driver_id) REFERENCES users(id)
        )`, (err) => {
            if (!err) {
                // Try to add column if table existed but column didn't (Migration for dev)
                db.run(`ALTER TABLE rides ADD COLUMN vehicle_type TEXT`, (alterErr) => {
                    // Ignore error if column already exists
                });
            }
        });
        
        // Reviews table
        db.run(`CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ride_id INTEGER,
            rider_id INTEGER,
            driver_id INTEGER,
            rating INTEGER CHECK(rating >= 1 AND rating <= 5),
            comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(ride_id) REFERENCES rides(id),
            FOREIGN KEY(rider_id) REFERENCES users(id),
            FOREIGN KEY(driver_id) REFERENCES users(id)
        )`);
    }
});

module.exports = db;
