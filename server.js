const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3');
const app = express();

// view engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const port = 3000;

app.get('/', (req, res ) => {
    res.render('index'); 
});

app.get('/live', (req, res ) => {
    res.render('live-game'); 
});

app.get('/fixture', (req, res ) => {
    res.render('matches-fixture'); 
});

app.get('/result', (req, res ) => {
    res.render('matches-result'); 
});

app.get('/sign-in', (req, res ) => {
    res.render('sign-in'); 
});

app.get('/sign-up', (req, res ) => {
    res.render('sign-up'); 
});

app.get('/admin', (req, res ) => {
    res.render('dashboard'); 
});


app.listen(port, () => {
    console.log(`Server started on port http://localhost:${port}`);
  });