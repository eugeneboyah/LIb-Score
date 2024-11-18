const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const app = express();
const bodyParser = require('body-parser');
const multer = require('multer');

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

const port = 3000;

// Open database connection once when the server starts
const db = new sqlite3.Database('./lib_live_score.db', (err) => {
    if (err) {
        console.error("Error opening database: " + err.message);
    } else {
        console.log("Connected to SQLite database.");
    }
});


// Create tables (called once when the app starts)
db.serialize(() => {
    // Leagues Table
    db.run(`
        CREATE TABLE IF NOT EXISTS Leagues (
            league_id INTEGER PRIMARY KEY AUTOINCREMENT,
            league_name TEXT NOT NULL
        )
    `);

    // Teams Table
    db.run(`
        CREATE TABLE IF NOT EXISTS Teams (
            team_id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT NOT NULL,
            logo BLOB,
            league_id INTEGER,
            FOREIGN KEY (league_id) REFERENCES Leagues(league_id)
        )
    `);

    // Matches Table
    db.run(`
        CREATE TABLE IF NOT EXISTS Matches (
            match_id INTEGER PRIMARY KEY AUTOINCREMENT,
            home_team_id INTEGER NOT NULL,
            away_team_id INTEGER NOT NULL,
            league_id INTEGER,
            start_time DATETIME,
            end_time DATETIME,
            status TEXT CHECK(status IN ('scheduled', 'ongoing', 'completed')),
            venue TEXT,
            referee TEXT,
            FOREIGN KEY (home_team_id) REFERENCES Teams(team_id),
            FOREIGN KEY (away_team_id) REFERENCES Teams(team_id),
            FOREIGN KEY (league_id) REFERENCES Leagues(league_id)
        )
    `);

    // Scores Table
    db.run(`
        CREATE TABLE IF NOT EXISTS Scores (
            score_id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            home_score INTEGER DEFAULT 0,
            away_score INTEGER DEFAULT 0,
            time_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (match_id) REFERENCES Matches(match_id)
        )
    `);

    // Players Table
    db.run(`
        CREATE TABLE IF NOT EXISTS Players (
            player_id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            player_name TEXT NOT NULL,
            position TEXT,
            nationality TEXT,
            age INTEGER,
            jersey_number INTEGER,
            FOREIGN KEY (team_id) REFERENCES Teams(team_id)
        )
    `);

    // Match Events Table
    db.run(`
        CREATE TABLE IF NOT EXISTS MatchEvents (
            event_id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            player_id INTEGER,
            team_id INTEGER,
            event_type TEXT CHECK(event_type IN ('goal', 'yellow_card', 'red_card', 'substitution')),
            event_time INTEGER,
            description TEXT,
            FOREIGN KEY (match_id) REFERENCES Matches(match_id),
            FOREIGN KEY (player_id) REFERENCES Players(player_id),
            FOREIGN KEY (team_id) REFERENCES Teams(team_id)
        )
    `);

    // Substitutions Table
    db.run(`
        CREATE TABLE IF NOT EXISTS Substitutions (
            substitution_id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            player_out_id INTEGER NOT NULL,
            player_in_id INTEGER NOT NULL,
            minute INTEGER,
            FOREIGN KEY (match_id) REFERENCES Matches(match_id),
            FOREIGN KEY (team_id) REFERENCES Teams(team_id),
            FOREIGN KEY (player_out_id) REFERENCES Players(player_id),
            FOREIGN KEY (player_in_id) REFERENCES Players(player_id)
        )
    `);

    // Standings Table 
    db.run(`
        CREATE TABLE IF NOT EXISTS Standings (
            standing_id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            league_id INTEGER NOT NULL,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            goal_difference INTEGER DEFAULT 0,
            FOREIGN KEY (team_id) REFERENCES Teams(team_id),
            FOREIGN KEY (league_id) REFERENCES Leagues(league_id)
        )
    `);

    // Roles Table
    db.run(`
        CREATE TABLE IF NOT EXISTS Roles (
            role_id INTEGER PRIMARY KEY AUTOINCREMENT,
            role_name TEXT NOT NULL UNIQUE
        )
    `);

    // Users Table
    db.run(`
        CREATE TABLE IF NOT EXISTS Users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            role_id INTEGER,
            FOREIGN KEY (role_id) REFERENCES Roles(role_id)
        )
    `);

    console.log("Tables created successfully.");
});

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

// Route for adding a score
app.post('/register/score', (req, res) => {
    const { match_id, home_score, away_score } = req.body;

    const query = `INSERT INTO Scores (match_id, home_score, away_score) VALUES (?, ?, ?)`;
    db.run(query, [match_id, home_score, away_score], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error adding score");
        }
        res.send("Score added successfully");
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

app.get('/live', (req, res) => {
    res.render('live-game'); 
});

app.get('/fixture', (req, res) => {
    const query = `
        SELECT 
            Matches.start_time, Matches.status, 
            home_team.team_name AS home_team_name, 
            home_team.logo AS home_team_logo, 
            away_team.team_name AS away_team_name, 
            away_team.logo AS away_team_logo, 
            Leagues.league_name 
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        JOIN Leagues ON Matches.league_id = Leagues.league_id
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

        res.render('matches-fixture', { matches });
    });
});

app.get('/result', (req, res) => {
    res.render('matches-result'); 
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
