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

// Route handlers
// app.use('/', indexRouter);
app.get('/index', async (req, res) => {
    const league_id = req.query.league_id || 1; // Default to league_id 1

    // Queries
    const nextMatchQuery = `
        SELECT Matches.match_id, Matches.start_time, Matches.status,
               home_team.team_name AS home_team_name, home_team.logo AS home_team_logo,
               away_team.team_name AS away_team_name, away_team.logo AS away_team_logo
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        WHERE Matches.league_id = ? AND Matches.status = 'scheduled'
        ORDER BY Matches.start_time ASC
        LIMIT 1
    `;

    const fixturesQuery = `
        SELECT Matches.start_time, Matches.status,
               home_team.team_name AS home_team_name, home_team.logo AS home_team_logo,
               away_team.team_name AS away_team_name, away_team.logo AS away_team_logo
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        WHERE Matches.league_id = ? AND Matches.status = 'scheduled'
        ORDER BY Matches.start_time ASC
        LIMIT 4
    `;

    const resultsQuery = `
        SELECT Matches.start_time, Matches.status,
               home_team.team_name AS home_team_name, home_team.logo AS home_team_logo,
               away_team.team_name AS away_team_name, away_team.logo AS away_team_logo,
               Scores.home_score, Scores.away_score
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        JOIN Scores ON Matches.match_id = Scores.match_id
        WHERE Matches.league_id = ? AND Matches.status = 'completed'
        ORDER BY Matches.start_time DESC
        LIMIT 4
    `;

    try {
        // Fetch data using async/await
        const nextMatch = await dbQuery(nextMatchQuery, [league_id]);
        const fixtures = await dbQuery(fixturesQuery, [league_id]);
        const results = await dbQuery(resultsQuery, [league_id]);

        // Convert logos from binary to Base64
        if (nextMatch.length) {
            convertLogos(nextMatch);
        }
        convertLogos(fixtures);
        convertLogos(results);

        // Render the index page
        res.render('index', {
            league_id,
            nextMatch: nextMatch.length ? nextMatch[0] : null,
            fixtures,
            results,
        });
    } catch (error) {
        console.error('Error retrieving data:', error);
        res.status(500).send('Error retrieving data.');
    }
});

// Helper function to query the database with Promises
app.get('/teams/:league_id', (req, res) => {
    const { league_id } = req.params;

    const query = `SELECT team_id, team_name FROM Teams WHERE league_id = ?`;
    db.all(query, [league_id], (err, rows) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error fetching teams");
        }
        res.json(rows);
    });
});


// Helper function to convert binary logos to Base64
function convertLogos(matches) {
    matches.forEach(match => {
        match.home_team_logo = match.home_team_logo
            ? `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`
            : null;
        match.away_team_logo = match.away_team_logo
            ? `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`
            : null;
    });
}

// Route to fetch teams based on selected league
app.get('/team', (req, res) => {
    const query = `SELECT league_id, league_name FROM Leagues`; // Assuming you have a Leagues table to fetch league data
    db.all(query, (err, leagues) => {
        if (err) {
            console.error('Error fetching leagues:', err.message);
            return res.status(500).send('Error fetching leagues');
        }
        res.render('addTeam', { leagues });  // Render the 'team-form' view, passing the leagues
    });
});




// Route for adding a team
app.post('/team', upload.single('logo_url'), (req, res) => {
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

// Fetch leagues for the match form
app.get('/match', (req, res) => {
    db.all('SELECT * FROM Leagues', (err, leagues) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error fetching leagues");
        }
        res.render('addMatch', { leagues });
    });
});

// Route for adding a match
app.post('/match', upload.none(), (req, res) => {
    console.log("Form Data:", req.body);  // Log the incoming form data

    const { home_team_id, away_team_id, league_id, start_time, status } = req.body;

    if (!home_team_id || !away_team_id) {
        return res.status(400).json({ message: "Home and Away teams must be selected." });
    }

    console.log("Inserting into the database with values:", [home_team_id, away_team_id, league_id, start_time, status]);

    // Proceed with adding match to the database
    const query = `INSERT INTO Matches (home_team_id, away_team_id, league_id, start_time, status) 
                   VALUES (?, ?, ?, ?, ?)`;

    db.run(query, [home_team_id, away_team_id, league_id, start_time, status], function(err) {
        if (err) {
            console.error("Error executing query:", err.message);  // Log any SQL error
            return res.status(500).json({ message: "Error adding match" });
        }

        console.log("Match added successfully");  // Log success
        res.json({ message: "Match added successfully" });
    });
});



app.get('/score', (req, res) => {
    res.render('addScore'); 
});
// Route to handle updating scores
app.post('/score', (req, res) => {
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

app.get('/player', (req, res) => {
    const leaguesQuery = 'SELECT league_id, league_name FROM Leagues';
    const matchesQuery = `
        SELECT Matches.match_id, Home.team_name AS home_team, Away.team_name AS away_team
        FROM Matches
        JOIN Teams AS Home ON Matches.home_team_id = Home.team_id
        JOIN Teams AS Away ON Matches.away_team_id = Away.team_id
    `;

    db.all(leaguesQuery, (err, leagues) => {
        if (err) {
            console.error('Error fetching leagues:', err.message);
            return res.status(500).send('Error fetching leagues');
        }

        db.all(matchesQuery, (err, matches) => {
            if (err) {
                console.error('Error fetching matches:', err.message);
                return res.status(500).send('Error fetching matches');
            }

            res.render('addPlayer', { leagues, matches }); // Pass leagues and matches to the EJS view
        });
    });
});

// Fetch teams for a specific match
app.get('/player/teams/:match_id', (req, res) => {
    const matchId = req.params.match_id;

    const query = `
        SELECT team_id, team_name
        FROM Teams
        WHERE team_id IN (
            SELECT home_team_id FROM Matches WHERE match_id = ?
            UNION
            SELECT away_team_id FROM Matches WHERE match_id = ?
        )
    `;

    db.all(query, [matchId, matchId], (err, teams) => {
        if (err) {
            console.error('Error fetching teams:', err.message);
            return res.status(500).json({ message: 'Error fetching teams' });
        }

        res.json(teams);
    });
});

// Fetch players for a specific team
app.get('/player/players/:team_id', (req, res) => {
    const teamId = req.params.team_id;

    const query = `
        SELECT player_id, player_name
        FROM Players
        WHERE team_id = ?
    `;

    db.all(query, [teamId], (err, players) => {
        if (err) {
            console.error('Error fetching players:', err.message);
            return res.status(500).json({ message: 'Error fetching players' });
        }

        res.json(players);
    });
});


// Route for adding a player
app.post('/player', upload.single('logo_url'), (req, res) => {
    console.log('Request body:', req.body);
    console.log('Uploaded file:', req.file);

    const { player_name, team_id, position, nationality, jersey_number } = req.body;

    // Ensure the necessary data is present
    if (!player_name || !team_id || !jersey_number) {
        return res.status(400).send('Player name, team ID, and jersey number are required.');
    }

    const query = `INSERT INTO Players (player_name, team_id, position, nationality, jersey_number) 
                   VALUES (?, ?, ?, ?, ?)`;

    db.run(query, [player_name, team_id, position, nationality, jersey_number], function(err) {
        if (err) {
            console.error('Error adding player:', err.message);
            return res.status(500).send('Error adding player');
        }

        res.send('Player added successfully');
    });
});



app.get('/event', (req, res) => {
    // Query the database to get matches
    const query = "SELECT * FROM Matches";
    db.all(query, [], (err, matches) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error fetching matches");
        }

        // Fetch teams and players for the dropdowns (if required)
        const teamsQuery = "SELECT * FROM Teams";
        const playersQuery = "SELECT * FROM Players";

        db.all(teamsQuery, [], (err, teams) => {
            if (err) {
                console.error(err.message);
                return res.status(500).send("Error fetching teams");
            }

            db.all(playersQuery, [], (err, players) => {
                if (err) {
                    console.error(err.message);
                    return res.status(500).send("Error fetching players");
                }

                // Pass the data to the view
                res.render('addMatchEvent', { matches, teams, players });
            });
        });
    });
});

// Route for adding a match event
app.post('/event', (req, res) => {
    console.log("Raw Body Data:", req.body);
    const { match_id, player_id, team_id, event_type, event_time, description } = req.body;

    console.log("Received Data:", { match_id, player_id, team_id, event_type, event_time, description });

    // Check if required fields are provided
    if (!match_id || !event_type || !event_time) {
        console.error("Missing required fields");
        return res.status(400).send("Missing required fields: match_id, event_type, or event_time.");
    }

    // SQL query to insert match event
    const query = `
        INSERT INTO MatchEvents (match_id, player_id, team_id, event_type, event_time, description)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.run(query, [match_id, player_id, team_id, event_type, event_time, description || null], function(err) {
        if (err) {
            console.error("Error inserting match event:", err.message);
            return res.status(500).send("Error adding match event");
        }
        res.send("Match event added successfully");
    });
});


app.get('/database', (req, res) => {
    const tables = {};

    // Queries to fetch data from all tables
    const queries = [
        { tableName: 'Teams', query: 'SELECT * FROM Teams' },
        { tableName: 'Matches', query: 'SELECT * FROM Matches' },
        { tableName: 'Scores', query: 'SELECT * FROM Scores' },
        { tableName: 'Players', query: 'SELECT * FROM Players' },
        { tableName: 'MatchEvents', query: 'SELECT * FROM MatchEvents' }
    ];

    let queryPromises = queries.map(({ tableName, query }) =>
        new Promise((resolve, reject) => {
            db.all(query, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    tables[tableName] = rows;
                    resolve();
                }
            });
        })
    );

    Promise.all(queryPromises)
        .then(() => {
            res.render('database-tables', { rows: tables });
        })
        .catch((error) => {
            console.error('Error fetching data from the database:', error);
            res.status(500).send('Error fetching data from the database');
        });
});
app.delete('/delete/:table/:id', (req, res) => {
    const { table, id } = req.params;
  
    // Dynamic SQL DELETE query based on the table
    let deleteQuery = '';
    if (table === 'Teams') {
      deleteQuery = `DELETE FROM teams WHERE team_id = ?`;
    } else if (table === 'Matches') {
      deleteQuery = `DELETE FROM matches WHERE match_id = ?`;
    } else if (table === 'MatchEvents') {
      deleteQuery = `DELETE FROM match_events WHERE event_id = ?`;
    } else if (table === 'Players') {
      deleteQuery = `DELETE FROM players WHERE player_id = ?`;
    } else if (table === 'Scores') {
      deleteQuery = `DELETE FROM scores WHERE score_id = ?`;
    } else {
      return res.status(400).json({ success: false, error: 'Invalid table' });
    }
  
    db.run(deleteQuery, [id], function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true });
    });
  });
  
  app.post('/edit/:table/:id', (req, res) => {
    const { table, id } = req.params;
    const { new_name } = req.body;
  
    let updateQuery = '';
    if (table === 'Teams') {
      updateQuery = `UPDATE teams SET team_name = ? WHERE team_id = ?`;
    } else if (table === 'Matches') {
      updateQuery = `UPDATE matches SET match_name = ? WHERE match_id = ?`;
    } else if (table === 'MatchEvents') {
      updateQuery = `UPDATE match_events SET event_name = ? WHERE event_id = ?`;
    } else if (table === 'Players') {
      updateQuery = `UPDATE players SET player_name = ? WHERE player_id = ?`;
    } else if (table === 'Scores') {
      updateQuery = `UPDATE scores SET score_value = ? WHERE score_id = ?`;
    } else {
      return res.status(400).json({ success: false, error: 'Invalid table' });
    }
  
    db.run(updateQuery, [new_name, id], function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true });
    });
  });
  
  

  app.get('/search', (req, res) => {
    const query = req.query.query;
  
    // Handle the search for players, teams, and leagues
    const playersQuery = `SELECT * FROM players WHERE player_name LIKE ?`;
    const teamsQuery = `SELECT * FROM teams WHERE team_name LIKE ?`;
    const leaguesQuery = `SELECT * FROM leagues WHERE league_name LIKE ?`;
  
    // Query players
    db.all(playersQuery, [`%${query}%`], (err, players) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
  
      // Query teams
      db.all(teamsQuery, [`%${query}%`], (err, teams) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
  
        // Query leagues
        db.all(leaguesQuery, [`%${query}%`], (err, leagues) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
  
          // Return data as a JSON response
          res.json({ players, teams, leagues });
        });
      });
    });
  });
  
  
  



// Route to fetch ongoing matches for the live game page
app.get('/live', async (req, res) => {
    const league_id = req.query.league_id || 1; // Default to 1 if not provided

    // Query for live matches including scores
    const liveMatchesQuery = `
        SELECT 
            Matches.match_id, Matches.start_time, Matches.status,
            home_team.team_name AS home_team_name, home_team.logo AS home_team_logo,
            away_team.team_name AS away_team_name, away_team.logo AS away_team_logo,
            Scores.home_score, Scores.away_score
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        LEFT JOIN Scores ON Matches.match_id = Scores.match_id
        WHERE Matches.league_id = ? AND Matches.status = 'ongoing'
    `;

    try {
        // Fetch live matches
        const liveMatches = await dbQuery(liveMatchesQuery, [league_id]);

        // Convert binary logos to Base64
        convertLogos(liveMatches);

        // Render the live game page
        res.render('live-game', {
            matches: liveMatches,
            league_id
        });
    } catch (error) {
        console.error('Error retrieving live matches:', error);
        res.status(500).send('Error retrieving live matches.');
    }
});



// Helper function to query the database with Promises
function dbQuery(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

// Helper function to convert binary logos to Base64
function convertLogos(matches) {
    matches.forEach(match => {
        match.home_team_logo = match.home_team_logo
            ? `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`
            : null;
        match.away_team_logo = match.away_team_logo
            ? `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`
            : null;
    });
}






// Set up an interval to check the start time for scheduled matches every minute
setInterval(() => {
    const query = `
        SELECT match_id, start_time FROM Matches
        WHERE status = 'scheduled'
    `;

    // Query the database to find matches that are scheduled
    db.all(query, [], (err, matches) => {
        if (err) {
            console.error("Error checking scheduled matches:", err.message);
            return;
        }

        // Loop through each scheduled match to check if the match time has passed
        matches.forEach((match) => {
            const currentTime = moment(); // Get the current time
            const startTime = moment(match.start_time); // Parse the match's start time

            // Check if the match start time has already passed
            if (startTime.isBefore(currentTime)) {
                // If the match has started, update its status to 'ongoing'
                const updateQuery = `
                    UPDATE Matches
                    SET status = 'ongoing'
                    WHERE match_id = ?
                `;

                // Run the query to update the match status
                db.run(updateQuery, [match.match_id], function (err) {
                    if (err) {
                        console.error("Error updating match status:", err.message);
                        return;
                    }

                    // Emit a message to the frontend that the match status has changed to 'ongoing'
                    io.emit('matchStatusChanged', { match_id: match.match_id, status: 'ongoing' });
                    console.log(`Match ${match.match_id} status changed to 'ongoing'`);
                });
            }
        });
    });
}, 60000); // Check every minute (60000 milliseconds)



// Route to get match fixture
app.get('/fixture', async (req, res) => {
    const leagueId = req.query.league_id || 1; // Default to league 1 if not specified
    const currentTime = new Date().toISOString(); // Current server time in ISO format

    // Query to update the status of matches whose start time has passed
    const updateStatusQuery = `
        UPDATE Matches
        SET status = 'ongoing'
        WHERE status = 'scheduled' AND start_time <= ?
    `;

    // Query to fetch scheduled fixtures for the selected league
    const fixturesQuery = `
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
        WHERE Matches.status = 'scheduled' AND Matches.league_id = ?
    `;

    try {
        // Update match statuses
        await dbRun(updateStatusQuery, [currentTime]);

        // Fetch fixtures for the league
        const matches = await dbQuery(fixturesQuery, [leagueId]);

        // Convert binary logos to Base64
        convertLogos(matches);

        // Render the fixture page
        res.render('matches-fixture', {
            matches,
            league_id: leagueId
        });
    } catch (error) {
        console.error('Error handling /fixture route:', error);
        res.status(500).send('Error fetching fixtures.');
    }
});

// Helper function to execute a database query with Promises
function dbQuery(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

// Helper function to execute a database update with Promises
function dbRun(query, params) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

// Helper function to convert binary logos to Base64
function convertLogos(matches) {
    matches.forEach(match => {
        match.home_team_logo = match.home_team_logo
            ? `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`
            : null;
        match.away_team_logo = match.away_team_logo
            ? `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`
            : null;
    });
}


// Helper function to execute a database query with Promises
function dbQuery(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

// Helper function to execute a database update with Promises
function dbRun(query, params) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) return reject(err);
            resolve(this);
        });
    });
}

// Helper function to convert binary logos to Base64
function convertLogos(matches) {
    matches.forEach(match => {
        match.home_team_logo = match.home_team_logo
            ? `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`
            : null;
        match.away_team_logo = match.away_team_logo
            ? `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`
            : null;
    });
}






app.get('/result', async (req, res) => {
    const leagueId = req.query.league_id || 1; // Default to league 1 if not specified

    // Query to fetch completed matches and their results for the selected league
    const resultsQuery = `
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
        WHERE Matches.status = 'completed' AND Matches.league_id = ?
    `;

    try {
        // Fetch completed matches and their scores
        const matches = await dbQuery(resultsQuery, [leagueId]);

        // Convert binary logos to Base64
        convertLogos(matches);

        // Render the results page
        res.render('matches-result', {
            matches,
            league_id: leagueId
        });
    } catch (error) {
        console.error('Error handling /result route:', error);
        res.status(500).send('Error fetching results.');
    }
});

// Helper function to execute a database query with Promises
function dbQuery(query, params) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

// Helper function to convert binary logos to Base64
function convertLogos(matches) {
    matches.forEach(match => {
        match.home_team_logo = match.home_team_logo
            ? `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`
            : null;
        match.away_team_logo = match.away_team_logo
            ? `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`
            : null;
    });
}


app.get('/table', (req, res) => {
    const leagueId = req.query.league_id || 1; // Default to league ID 1

    // Query to fetch matches, scores, and team details for the specified league
    const query = `
        SELECT 
            Matches.match_id,
            Matches.home_team_id, Matches.away_team_id, Matches.status,
            Scores.home_score, Scores.away_score,
            ht.team_name AS home_team_name, ht.logo AS home_team_logo,
            at.team_name AS away_team_name, at.logo AS away_team_logo
        FROM Matches
        JOIN Scores ON Matches.match_id = Scores.match_id
        JOIN Teams ht ON Matches.home_team_id = ht.team_id
        JOIN Teams at ON Matches.away_team_id = at.team_id
        WHERE Matches.league_id = ? AND Matches.status = 'completed';
    `;

    db.all(query, [leagueId], (err, matches) => {
        if (err) {
            console.error(err.message); // Log errors if any
            return res.status(500).send("Error fetching league data."); // Send error response
        }

        // Convert binary logo data for each match to Base64
        matches.forEach(match => {
            if (match.home_team_logo) {
                match.home_team_logo = `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`;
            }
            if (match.away_team_logo) {
                match.away_team_logo = `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`;
            }
        });

        // Initialize an object to store stats for each team
        const stats = {};

        // Loop through all matches to calculate stats
        matches.forEach(match => {
            const {
                home_team_id,
                away_team_id,
                home_team_name,
                away_team_name,
                home_team_logo,
                away_team_logo,
                home_score,
                away_score
            } = match;

            // Ensure stats object has home and away team entries
            if (!stats[home_team_id]) {
                stats[home_team_id] = {
                    team_id: home_team_id,
                    team_name: home_team_name,
                    logo: home_team_logo,
                    P: 0, W: 0, D: 0, L: 0, PTS: 0
                };
            }
            if (!stats[away_team_id]) {
                stats[away_team_id] = {
                    team_id: away_team_id,
                    team_name: away_team_name,
                    logo: away_team_logo,
                    P: 0, W: 0, D: 0, L: 0, PTS: 0
                };
            }

            // Update stats based on match result
            stats[home_team_id].P += 1; // Increment games played for home team
            stats[away_team_id].P += 1; // Increment games played for away team

            if (home_score > away_score) { // Home team wins
                stats[home_team_id].W += 1;
                stats[away_team_id].L += 1;
                stats[home_team_id].PTS += 3; // 3 points for a win
            } else if (home_score < away_score) { // Away team wins
                stats[away_team_id].W += 1;
                stats[home_team_id].L += 1;
                stats[away_team_id].PTS += 3; // 3 points for a win
            } else { // Draw
                stats[home_team_id].D += 1;
                stats[away_team_id].D += 1;
                stats[home_team_id].PTS += 1; // 1 point for a draw
                stats[away_team_id].PTS += 1;
            }
        });

        // Convert the stats object to an array for easier processing in the view
        const statsArray = Object.values(stats);

        // Sort the stats array by points (descending), wins, then alphabetical team names
        statsArray.sort((a, b) => {
            if (b.PTS !== a.PTS) return b.PTS - a.PTS; // Sort by points first
            if (b.W !== a.W) return b.W - a.W; // Sort by wins next
            return a.team_name.localeCompare(b.team_name); // Sort alphabetically by team name
        });

        // Render the 'games-table' view and pass the stats array
        res.render('games-table', { stats: statsArray, league_id: leagueId });
    });
});

app.get('/statistices', (req, res) => {
    const match_id = req.query.match_id;

    if (!match_id) {
        console.error("Match ID is missing in the query.");
        return res.status(400).send("Match ID is required.");
    }

    console.log("Fetching data for Match ID:", match_id);

    // Fetch match details including team names, logos, and scores
    db.all(`
        SELECT m.match_id, t1.team_name AS home_team, t2.team_name AS away_team, 
               ms.home_score, ms.away_score, m.league_id, 
               t1.logo AS home_team_logo, t2.logo AS away_team_logo
        FROM Matches m
        JOIN Teams t1 ON m.home_team_id = t1.team_id
        JOIN Teams t2 ON m.away_team_id = t2.team_id
        JOIN Scores ms ON m.match_id = ms.match_id
        WHERE m.match_id = ?`, [match_id], (err, matchDetails) => {
        if (err) {
            console.error("Error fetching match details:", err);
            return res.status(500).send('Error fetching match details');
        }

        if (!matchDetails || matchDetails.length === 0) {
            console.log('No match found for match_id:', match_id);
            return res.status(404).send('Match not found');
        }

        const match = matchDetails[0]; // Assuming only one match is returned

        // Convert binary logo data to Base64
        if (match.home_team_logo) {
            match.home_team_logo = `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`;
        }
        if (match.away_team_logo) {
            match.away_team_logo = `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`;
        }

        // Fetch events for the match, including player names and team names
        db.all(`
            SELECT me.event_time, me.event_type, p.player_name, me.description, t.team_name
            FROM MatchEvents me
            JOIN Players p ON me.player_id = p.player_id
            JOIN Teams t ON me.team_id = t.team_id
            WHERE me.match_id = ?`, [match_id], (err, events) => {
            if (err) {
                console.error("Error fetching events for match_id:", match_id, "Error:", err);
                return res.status(500).send('Error fetching events');
            }

            console.log("Fetched events:", events); // Log events to verify the data

            // Pass match and events data to the view
            res.render('stats', {
                home_team_name: match.home_team,
                away_team_name: match.away_team,
                home_score: match.home_score,
                away_score: match.away_score,
                home_logo: match.home_team_logo,
                away_logo: match.away_team_logo,
                match_id: match.match_id,
                events: events // Pass events to the view
            });
        });
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
