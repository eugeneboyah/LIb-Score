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


app.listen(port, () => {
    console.log(`Server started on port http://localhost:${port}`);
  });