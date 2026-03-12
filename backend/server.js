require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require("socket.io");
const authRoutes = require('./routes/auth');
const riderRoutes = require('./routes/rider');
const driverRoutes = require('./routes/driver');
const chatbotRoutes = require('./chatbot/chatbotRoutes');
const db = require('./database');
const LoyaltyService = require('./loyaltyService');
const loyaltyRoutes = require('./routes/loyalty');
const RatingService = require('./ratingService');
const ratingRoutes = require('./routes/rating');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // allow all for now, tighten later
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(bodyParser.json());

// Initialize Services
const loyaltyService = new LoyaltyService(io);
loyaltyService.init();
const ratingService = new RatingService();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rider', riderRoutes(io)); // pass io for real-time updates
app.use('/api/driver', driverRoutes(io));
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/loyalty', loyaltyRoutes(loyaltyService));
app.use('/api/rating', ratingRoutes(ratingService));

// Middleware for errors
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Socket.IO Handling
io.on('connection', (socket) => {
    console.log('a user connected', socket.id);

    // Join rooms based on role/id
    socket.on('join', (data) => {
        socket.join(String(data.room)); // Ensure room is a string
        console.log(`User ${socket.id} joined room ${data.room}`);
    });

    // Handle location updates from drivers
    socket.on('updateLocation', (data) => {
        console.log(`[SOCKET] updateLocation from ${data.driverId}: ${data.lat}, ${data.lng}`);
        // Broadcast to riders looking for drivers (or specific rider if matched)
        io.emit('driverLocationUpdate', data); // rudimentary broadcast
        // Update DB
        if (data.driverId) {
            db.run(`INSERT OR REPLACE INTO drivers (user_id, latitude, longitude, status) VALUES (?, ?, ?, ?)`,
                [data.driverId, data.lat, data.lng, 'available'], (err) => {
                    if (err) console.error(err);
                });
        }
    });

    // Mock Ride Acceptance from Driver to Rider
    socket.on('mockDriverAssigned', (data) => {
        console.log(`[SOCKET] Driver manually accepted a mocked test ride!`);
        io.emit('rideAccepted', {
            rideId: data.rideId || `mock-${Date.now()}`,
            driverId: data.driverId || 'mock-dr-1',
            status: 'accepted'
        });
    });

    // Payment Completed Broadcast
    socket.on('payment_completed_broadcast', (data) => {
        console.log(`[SOCKET] Rider completed payment for ride: ${data.rideId}`);
        io.emit('paymentCompleted', data);
    });

    // Mock Ride Broadcast for Demo Purposes
    socket.on('ride_requested_broadcast', (data) => {
        console.log(`[SOCKET] Broadcasting mock ride attempt to all drivers.`);

        const rideId = data.ride?.id || `mock-${Date.now()}`;
        const driverId = 'mock-auto-dr-1';

        // Emit to all connected sockets
        io.emit('newRideRequest', data.ride || {
            id: rideId,
            rider: 'Guest Rider',
            pickup: { address: 'Amrita University' },
            dropoff: { address: 'Destination' },
            distance: '5 km',
            price: data.vehicle?.price || 200,
        });

        // AUTO-ACCEPT FOR SOLO TESTING
        // If a real driver clicks accept, they will override this.
        setTimeout(async () => {
            console.log(`[SOCKET] Auto-accepting ride ${rideId} for demo purposes`);
            io.emit('rideAccepted', {
                rideId: rideId,
                driverId: driverId,
                status: 'accepted'
            });

            // Start broadcasting mock live location for this auto driver
            let startLoc = [76.9558, 11.0168]; // Gandhipuram driver start
            let endLoc = [76.9006, 10.9027];   // Amrita University pickup

            try {
                // Fetch real road coordinates
                const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
                const res = await fetchFn(`https://router.project-osrm.org/route/v1/driving/${startLoc[0]},${startLoc[1]};${endLoc[0]},${endLoc[1]}?overview=full&geometries=geojson`);
                const data = await res.json();

                if (data.routes?.[0]) {
                    const coords = data.routes[0].geometry.coordinates; // [lng, lat]
                    let step = 0;

                    const simInterval = setInterval(() => {
                        if (step >= coords.length) {
                            clearInterval(simInterval);
                            return;
                        }
                        const currentPos = coords[step];
                        io.emit('driverLocationUpdate', {
                            driverId,
                            lat: currentPos[1],
                            lng: currentPos[0]
                        });

                        // Move 3 steps along the route each tick for speed
                        step += 3;
                    }, 2000);
                    return; // Successfully started real-road simulation!
                }
            } catch (err) {
                console.log("OSRM routing failed, falling back to simple mock", err.message);
            }

            // Fallback: If routing fails, fly straight 🦅
            let lat = startLoc[1];
            let lng = startLoc[0];
            let count = 0;
            const simInterval = setInterval(() => {
                count++;
                lat -= 0.0003;
                lng -= 0.0003;
                io.emit('driverLocationUpdate', { driverId, lat, lng });

                if (count > 600) clearInterval(simInterval);
            }, 3000);

        }, 3500); // Wait 3.5 seconds before auto-accepting
    });

    // AI Chatbot Auto-Replies
    socket.on('chatMessage', (data) => {
        console.log(`[CHAT] Rider says: ${data.text}`);

        let reply = "I'm on my way! Should be there shortly.";
        const lowerText = data.text.toLowerCase();

        if (lowerText.includes('where') || lowerText.includes('how long')) {
            reply = "I'm currently navigating through traffic on the main road. I estimate I'll be there in about 4 minutes!";
        } else if (lowerText.includes('cancel') || lowerText.includes('wrong')) {
            reply = "Oh no, do you need me to stop? Just cancel in the app if you have changed your mind.";
        } else if (lowerText.includes('gate') || lowerText.includes('entrance')) {
            reply = "Got it! I will pull up exactly at the entrance/gate and wait for you.";
        } else if (lowerText.includes('thanks') || lowerText.includes('ok')) {
            reply = "No problem! See you in a bit.";
        }

        // Delay the reply to feel human
        setTimeout(() => {
            io.emit('chatReply', {
                text: reply,
                sender: 'them',
                timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            });
        }, 2000 + Math.random() * 2000);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);
    });
});

module.exports = app; // For testing
