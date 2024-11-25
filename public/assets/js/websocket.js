const ws = new WebSocket('ws://localhost:8080');

ws.onmessage = (event) => {
    console.log("event: ", event);
    
    const liveMatches = JSON.parse(event.data);

    // Update the live matches section dynamically
    updateLiveGames(liveMatches);
};

function updateLiveGames(matches) {
    const liveGameContainer = document.getElementById('live-game-container');
    liveGameContainer.innerHTML = ''; // Clear current matches

    matches.forEach(match => {
        const matchElement = document.createElement('div');
        matchElement.innerHTML = `
            <div class="match">
                <div class="teams">
                    <div>${match.home_team_name}</div>
                    <div>${match.away_team_name}</div>
                </div>
                <div class="timer">${match.timer}'</div>
            </div>
        `;
        liveGameContainer.appendChild(matchElement);
    });
}

