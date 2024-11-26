const express = require('express');
const app = express();


app.get('sindex', (req, res) => {
    const nextMatchQuery = `
        SELECT 
            Matches.match_id, Matches.start_time, Matches.status,
            home_team.team_name AS home_team_name, home_team.logo AS home_team_logo,
            away_team.team_name AS away_team_name, away_team.logo AS away_team_logo
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        WHERE Matches.league_id = 2 AND Matches.status = 'scheduled'
        ORDER BY Matches.start_time ASC
        LIMIT 1
    `;

    const fixturesQuery = `
        SELECT 
            Matches.start_time, Matches.status,
            home_team.team_name AS home_team_name, home_team.logo AS home_team_logo,
            away_team.team_name AS away_team_name, away_team.logo AS away_team_logo
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        WHERE Matches.league_id = 2 AND Matches.status = 'scheduled'
        ORDER BY Matches.start_time ASC
        LIMIT 4
    `;

    const resultsQuery = `
        SELECT 
            Matches.start_time, Matches.status,
            home_team.team_name AS home_team_name, home_team.logo AS home_team_logo,
            away_team.team_name AS away_team_name, away_team.logo AS away_team_logo,
            Scores.home_score, Scores.away_score
        FROM Matches
        JOIN Teams AS home_team ON Matches.home_team_id = home_team.team_id
        JOIN Teams AS away_team ON Matches.away_team_id = away_team.team_id
        JOIN Scores ON Matches.match_id = Scores.match_id
        WHERE Matches.league_id = 2 AND Matches.status = 'completed'
        ORDER BY Matches.start_time DESC
        LIMIT 4
    `;

    // Query for the next match
    db.all(nextMatchQuery, [], (err, nextMatch) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error retrieving the next match.");
        }

        // Query for fixtures
        db.all(fixturesQuery, [], (err, fixtures) => {
            if (err) {
                console.error(err.message);
                return res.status(500).send("Error retrieving fixtures.");
            }

            // Query for results
            db.all(resultsQuery, [], (err, results) => {
                if (err) {
                    console.error(err.message);
                    return res.status(500).send("Error retrieving results.");
                }

                // Convert binary logo data to Base64 (if applicable)
                const processLogos = matches => matches.forEach(match => {
                    if (match.home_team_logo) {
                        match.home_team_logo = `data:image/png;base64,${Buffer.from(match.home_team_logo).toString('base64')}`;
                    }
                    if (match.away_team_logo) {
                        match.away_team_logo = `data:image/png;base64,${Buffer.from(match.away_team_logo).toString('base64')}`;
                    }
                });

                // Process logos for matches
                if (nextMatch.length) processLogos(nextMatch);
                if (fixtures.length) processLogos(fixtures);
                if (results.length) processLogos(results);

                // Render the page
                res.render('index.ejs', {
                    nextMatch: nextMatch.length ? nextMatch[0] : null, // Get the first match or null if empty
                    fixtures,
                    results
                });
            });
        });
    });
});

module.exports = router;