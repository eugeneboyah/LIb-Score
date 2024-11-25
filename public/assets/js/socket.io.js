// Initialize Socket.IO client
const socket = io();
console.log("socket connected");
// Listen for the 'scoreUpdate' event broadcast from the server
socket.on('scoreUpdate', ({ match_id, home_score, away_score }) => {
    // Find the HTML elements for the scores using dynamic IDs
    const homeScoreElement = document.getElementById(`home-score-${match_id}`);
    const awayScoreElement = document.getElementById(`away-score-${match_id}`);

    // Update the content of the elements with the new scores
    if (homeScoreElement) homeScoreElement.textContent = home_score;
    if (awayScoreElement) awayScoreElement.textContent = away_score;
});

// Listen for the 'matchStarted' event from the server
socket.on('matchStarted', (data) => {
    // Select the match element by its ID (which is match-<match_id>)
    const matchElement = document.querySelector(`#match-${data.match_id}`);

    // If the match element exists (i.e., it is present on the page)
    if (matchElement) {
        // Remove the match from the fixture section since it is now live
        matchElement.remove();
    }
});


//  // Listen for the 'matchStatusChanged' event
//  socket.on('matchStatusChanged', (data) => {
//     // Check if the match status has changed to 'ongoing'
//     if (data.status === 'ongoing') {
//         const matchId = data.match_id;  // Get the match ID from the emitted data
//         const matchElement = document.getElementById(`match-${matchId}`);  // Find the match element on the page by its ID
//         const fixtureSection = document.querySelector('.league-list');  // The fixture section in your DOM

//         // If the match is found in the fixture, remove it (since it has started)
//         if (matchElement) {
//             fixtureSection.removeChild(matchElement); // Remove the match from the fixture
//             console.log(`Match ${matchId} is now ongoing and removed from fixture.`);
//         }

//         // Optionally, add this match to the live game section (if you have a separate live game section)
//         const liveGameSection = document.querySelector('.live-game-section');  // Your live game section in the DOM
//         const newMatchItem = document.createElement('div');
//         newMatchItem.className = 'match-item live-game-item';  // Assign a class to the new element
//         newMatchItem.innerHTML = `
//             <div class="match-time">
//                 <span>Live Game</span><br>
//                 <span>Time: 0'</span>
//             </div>
//             <div class="teams">
//                 <div class="team">
//                     <img src="${matchElement.querySelector('.home-team-logo').src}" alt="">
//                     <span>${matchElement.querySelector('.home-team-name').textContent}</span>
//                 </div>
//                 <div class="team">
//                     <img src="${matchElement.querySelector('.away-team-logo').src}" alt="">
//                     <span>${matchElement.querySelector('.away-team-name').textContent}</span>
//                 </div>
//             </div>
//             <div class="scores">
//                 <span>Score: 0 - 0</span>
//             </div>
//         `;
//         liveGameSection.appendChild(newMatchItem);  // Add the match to the live section
//     }
// });