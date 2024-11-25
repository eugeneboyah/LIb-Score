const WebSocket = require("ws");
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const app = express();
const bodyParser = require('body-parser');
const multer = require('multer');
const cron = require('node-cron');
const http = require('http');
const socketIo = require('socket.io');
const moment = require('moment'); // Import moment.js for handling date and time


const server = http.createServer(app); // Pass your app to the HTTP server
const io = socketIo(server);          // Attach Socket.IO to the server
const port = 3000;

const wss = new WebSocket.Server({ port: 8081 });

// Set up multer for file uploads using memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // Limit file size to 8MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images are allowed!'));
  }
});

// Middleware to parse URL-encoded bodies (as sent by HTML forms)
app.use(bodyParser.urlencoded({ extended: true }));

// Set the view engine and static files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));


// Open database connection once when the server starts
const db = new sqlite3.Database('./lib_live_score.db', (err) => {
    if (err) {
        console.error("Error opening database: " + err.message);
    } else {
        console.log("Connected to SQLite database.");
    }
});

// Listen for score updates
io.on('connection', (socket) => {
    console.log("A user connected");

    socket.on('disconnect', () => {
        console.log("A user disconnected");
    });
});

// cron.schedule('* * * * *', () => {
//     const query = `
//         SELECT match_id, start_time, status, home_team_id, away_team_id, league_id
//         FROM Matches
//         WHERE status = 'ongoing'
//     `;

//     db.all(query, [], (err, matches) => {
//         if (err) {
//             console.error("Error fetching matches:", err.message);
//             return;
//         }

//         const now = Date.now();
//         matches.forEach(match => {
//             const matchStartTime = new Date(match.start_time).getTime();
//             const elapsedMinutes = Math.floor((now - matchStartTime) / 60000);

//             if (elapsedMinutes >= 90 && match.status === 'ongoing') {
//                 const updateQuery = `UPDATE Matches SET status = 'completed' WHERE match_id = ?`;
//                 db.run(updateQuery, [match.match_id], (updateErr) => {
//                     if (updateErr) {
//                         console.error('Error updating match status:', updateErr.message);
//                     } else {
//                         // Emit event with updated match data
//                         io.emit('matchStatusUpdate', {
//                             match_id: match.match_id,
//                             status: 'completed',
//                             home_team_id: match.home_team_id,
//                             away_team_id: match.away_team_id,
//                             league_id: match.league_id,
//                         });
//                     }
//                 });
//             }
//         });
//     });
// });


// const broadcastUpdates = () => {
//     const liveQuery = `
//         SELECT * FROM Matches WHERE status = 'ongoing';
//     `;
//     db.all(liveQuery, [], (err, matches) => {
//         if (!err) {
//             wss.clients.forEach(client => {
//                 if (client.readyState === WebSocket.OPEN) {
//                     client.send(JSON.stringify(matches));
//                 }
//             });
//         }
//     });
// };

// // Call this function every minute
// setInterval(broadcastUpdates, 60000);

// Route handlers
app.get('/', (req, res) => {
    res.render('index'); 
});


// Route to render the forms with leagues
app.get('/register', (req, res) => {
    db.all(`SELECT * FROM Leagues`, (err, leagues) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error fetching leagues");
        }
        res.render('form', { leagues });
    });
});

// Route for adding a team
app.post('/register/team', upload.single('logo_url'), (req, res) => {
    console.log('Request body:', req.body);
    console.log('Uploaded file:', req.file);
    
    const { team_name, league_id } = req.body;
  
    // Ensure a file was uploaded
    if (!req.file) {
      return res.status(400).send('Logo is required');
    }
  
    const teamLogo = req.file.buffer; // Buffer containing the logo's binary data
  
    const query = `INSERT INTO Teams (team_name, logo, league_id) VALUES (?, ?, ?)`;
    db.run(query, [team_name, teamLogo, league_id], (err) => {
      if (err) {
        console.error(err.message);
        return res.status(500).send('Error adding team');
      }
      res.send('Team added successfully');
    });
  });

  const updateMatchStatus = () => {
    const query = `
        UPDATE Matches
        SET status = 'completed'
        WHERE status = 'ongoing' AND
              strftime('%s', 'now') - strftime('%s', start_time) >= 5400
    `; // 5400 seconds = 90 minutes

    db.run(query, [], (err) => {
        if (err) {
            console.error("Error updating match statuses:", err.message);
        } else {
            console.log("Match statuses updated successfully.");
        }
    });
};

// Run the check every minute
setInterval(updateMatchStatus, 60000);


// Route for adding a match
app.post('/register/match', (req, res) => {
    const { home_team_id, away_team_id, league_id, start_time, status } = req.body;

    const query = `INSERT INTO Matches (home_team_id, away_team_id, league_id, start_time, status) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [home_team_id, away_team_id, league_id, start_time, status], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error adding match");
        }
        res.send("Match added successfully");
    });
});

// Route to handle updating scores
app.post('/register/score', (req, res) => {
    const { match_id, home_score, away_score } = req.body;
    const currentTime = new Date().toISOString();  // Get current timestamp

    // Check if the match already has a score record
    const selectQuery = `SELECT * FROM Scores WHERE match_id = ?`;

    db.get(selectQuery, [match_id], (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error checking score record");
        }

        if (row) {
            // If record exists, update the scores
            const updateQuery = `
                UPDATE Scores
                SET home_score = ?, away_score = ?, time_updated = ?
                WHERE match_id = ?
            `;
            db.run(updateQuery, [home_score, away_score, currentTime, match_id], function (err) {
                if (err) {
                    console.error(err.message);
                    return res.status(500).send("Error updating score");
                }
                console.log(`Updated match ${match_id} score: Home - ${home_score}, Away - ${away_score}`);
                io.emit('scoreUpdate', { match_id, home_score, away_score });
                res.send("Score updated successfully");
            });
        } else {
            // If no record exists, insert a new score record
            const insertQuery = `
                INSERT INTO Scores (match_id, home_score, away_score, time_updated)
                VALUES (?, ?, ?, ?)
            `;
            db.run(insertQuery, [match_id, home_score, away_score, currentTime], function (err) {
                if (err) {
                    console.error(err.message);
                    return res.status(500).send("Error inserting score");
                }
                console.log(`Inserted match ${match_id} score: Home - ${home_score}, Away - ${away_score}`);
                io.emit('scoreUpdate', { match_id, home_score, away_score });
                res.send("Score inserted successfully");
            });
        }
    });
});



// Route for adding a player
app.post('/register/player', (req, res) => {
    const { team_id, player_name, position, nationality, jersey_number } = req.body;

    const query = `INSERT INTO Players (team_id, player_name, position, nationality, jersey_number) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [team_id, player_name, position, nationality, jersey_number], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error adding player");
        }
        res.send("Player added successfully");
    });
});

// Route for adding a match event
app.post('/register/event', (req, res) => {
    const { match_id, player_id, team_id, event_type, event_time } = req.body;

    const query = `INSERT INTO MatchEvents (match_id, player_id, team_id, event_type, event_time) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [match_id, player_id, team_id, event_type, event_time], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error adding match event");
        }
        res.send("Match event added successfully");
    });
});

// Route to fetch ongoing matches for the live game page
app.get('/live', (req, res) => {
    // SQL query to join necessary tables and fetch ongoing matches
    const query = `
        SELECT 
            Matches.match_id, Matches.start_time, Matches.status,
            home_team.team_name AS home_team_name, 
            home_team.logo AS home_team_logo, 
            away_team.team_name AS away_team_name, 
            away_team.logo AS away_team_logo, 
            Leagues.league_name,
            Scores.home_score, Scores.away_score
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        JOIN Leagues ON Matches.league_id = Leagues.league_id
        LEFT JOIN Scores ON Matches.match_id = Scores.match_id
        WHERE Matches.status = 'ongoing'  -- Only fetch matches with status 'ongoing'
        ORDER BY Matches.start_time ASC  -- Order by start time
    `;

    // Execute the query to fetch matches
    db.all(query, [], (err, matches) => {
        if (err) {
            console.error("Error fetching matches:", err.message); // Log error if query fails
            return res.status(500).send("Error retrieving live matches."); // Respond with error
        }

        // Process matches: Convert team logos into base64 format for direct use in HTML
        const processedMatches = matches.map(match => ({
            ...match, // Keep existing match properties
            home_team_logo: match.home_team_logo 
                ? `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`
                : null, // Convert home team logo to base64 or use null if not available
            away_team_logo: match.away_team_logo 
                ? `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`
                : null  // Convert away team logo to base64 or use null if not available
        }));

        // Render the live-game view and pass the processed matches data
        res.render('live-game', { matches: processedMatches });
    });
});


// Function to check if any match should be moved to "ongoing"
function checkMatchStartTime() {
    const query = `
        SELECT match_id, start_time FROM Matches
        WHERE status = 'scheduled' AND start_time <= ?
    `;
    
    // Run the query, passing the current time to check against scheduled matches
    db.all(query, [moment().format('YYYY-MM-DD HH:mm:ss')], (err, matches) => {
        if (err) {
            console.error("Error fetching matches:", err.message);  // Log any errors
            return;
        }

        // Iterate through each match that has passed its start time
        matches.forEach(match => {
            // Update the match status to "ongoing"
            const updateQuery = `
                UPDATE Matches SET status = 'ongoing'
                WHERE match_id = ?
            `;
            db.run(updateQuery, [match.match_id], function (err) {
                if (err) {
                    console.error("Error updating match status:", err.message); // Log any errors
                    return;
                }

                console.log(`Match ${match.match_id} status updated to ongoing.`);  // Log success

                // Emit the match status change to the frontend using Socket.IO
                io.emit('matchStarted', { match_id: match.match_id });
            });
        });
    });
}

// Check every minute if any match status should be updated to ongoing
setInterval(checkMatchStartTime, 60000);



// Route to get match fixture
app.get('/fixture', (req, res) => {
    const currentTime = new Date(); // Current server time

    // Query to update the status of matches whose start time has passed
    const updateStatusQuery = `
        UPDATE Matches
        SET status = 'ongoing'
        WHERE status = 'scheduled' AND start_time <= ?
    `;
    
    // Update the status of scheduled matches to ongoing if the start time has passed
    db.run(updateStatusQuery, [currentTime.toISOString()], function(err) {
        if (err) {
            console.error(err.message);
        }
    });

    // Query to get the fixture (only matches that are scheduled)
    const query = `
        SELECT 
            Matches.match_id, Matches.start_time, Matches.status, 
            home_team.team_name AS home_team_name, 
            home_team.logo AS home_team_logo, 
            away_team.team_name AS away_team_name, 
            away_team.logo AS away_team_logo, 
            Leagues.league_name 
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        JOIN Leagues ON Matches.league_id = Leagues.league_id
        WHERE Matches.status = 'scheduled'
        ORDER BY Matches.start_time ASC
    `;

    db.all(query, [], (err, matches) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error retrieving matches.");
        }

        // Convert binary logo data to Base64
        matches.forEach(match => {
            if (match.home_team_logo) {
                match.home_team_logo = `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`;
            }
            if (match.away_team_logo) {
                match.away_team_logo = `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`;
            }
        });

        // Render the fixture page with the scheduled matches
        res.render('matches-fixture', { matches });
    });
});



app.get('/result', (req, res) => {
    const query = `
        SELECT 
            Matches.match_id, Matches.start_time, Matches.status,
            home_team.team_name AS home_team_name, 
            home_team.logo AS home_team_logo, 
            away_team.team_name AS away_team_name, 
            away_team.logo AS away_team_logo, 
            Leagues.league_name,
            Scores.home_score, Scores.away_score
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        JOIN Leagues ON Matches.league_id = Leagues.league_id
        LEFT JOIN Scores ON Matches.match_id = Scores.match_id
        WHERE Matches.status = 'completed'
        ORDER BY Matches.start_time DESC
    `;

    db.all(query, [], (err, matches) => {
        if (err) {
            console.error("Error fetching match results:", err.message);
            return res.status(500).send("Error retrieving match results.");
        }

        // Convert logos to base64 if necessary
        matches.forEach(match => {
            if (match.home_team_logo) {
                match.home_team_logo = `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`;
            }
            if (match.away_team_logo) {
                match.away_team_logo = `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`;
            }
        });

        res.render('matches-result', { matches });
    });
});

app.get('/billing', (req, res) => {
    res.render('billing'); 
});

app.get('/sign-in', (req, res) => {
    res.render('sign-in'); 
});

// Handle POST request for the sign-in form
app.post('/sign-in', (req, res) => {
    const { email, password } = req.body;

    // Check if the user exists in the database
    db.get("SELECT * FROM Users WHERE email = ?", [email], (err, row) => {
        if (err) {
            console.error("Error querying database: " + err.message);
            return res.status(500).send("Error processing request.");
        }

        // If no user is found or password doesn't match, send error response
        if (!row || !bcrypt.compareSync(password, row.password_hash)) {
            return res.status(401).send("Invalid email or password.");
        }

        // Redirect to Admin page if user is an Admin (role_id = 1)
        if (row.role_id === 1) {
            return res.redirect('/admin');
        }

        // If not Admin, handle accordingly
        return res.status(401).send("You are not authorized to access the Admin page.");
    });
});

app.get('/sign-up', (req, res) => {
    res.render('sign-up'); 
});

// Handle POST request for the sign-up form
app.post('/sign-up', (req, res) => {
    const { username, email, password, role } = req.body;

    // Hash the password before saving it to the database
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            console.error("Error hashing password: " + err.message);
            return res.status(500).send("Error processing request.");
        }

        // Get the role_id for 'Admin' (assuming role 'Admin' exists in Roles table)
        db.get("SELECT role_id FROM Roles WHERE role_name = ?", ['Admin'], (err, row) => {
            if (err) {
                console.error("Error fetching role_id: " + err.message);
                return res.status(500).send("Error processing request.");
            }

            // Insert the new user into the Users table
            const roleId = row.role_id;
            db.run("INSERT INTO Users (username, password_hash, email, role_id) VALUES (?, ?, ?, ?)", [username, hashedPassword, email, roleId], function (err) {
                if (err) {
                    console.error("Error inserting user: " + err.message);
                    return res.status(500).send("Error inserting user into database.");
                }

                console.log("User registered successfully!");
                res.redirect('/sign-in'); // Redirect to the sign-in page after successful registration
            });
        });
    });
});

app.get('/admin', (req, res) => {
    res.render('dashboard'); 
});

app.get('/control', (req, res) => {
    res.render('control'); 
});

// Gracefully shut down and close the database connection
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error("Error closing database: " + err.message);
        } else {
            console.log("Database connection closed.");
        }
        process.exit();
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server started on port http://localhost:${port}`);
});
