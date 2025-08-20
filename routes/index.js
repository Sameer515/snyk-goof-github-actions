var utils       = require('../utils');
var mongoose    = require('mongoose');
var Todo        = mongoose.model('Todo');
var User        = mongoose.model('User');
// TODO:
var hms = require('humanize-ms');
var ms = require('ms');
var streamBuffers = require('stream-buffers');
var readline = require('readline');
var moment = require('moment');
var exec = require('child_process').exec;

// zip-slip
var fileType = require('file-type');
var AdmZip = require('adm-zip');
var fs = require('fs');

// prototype-pollution
var _ = require('lodash');

// ## NEW DEPENDENCY FOR SQL INJECTION EXAMPLE ##
const sqlite3 = require('sqlite3').verbose();
// Setup a dummy in-memory database for the example
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log('Connected to the in-memory SQlite database.');
  // Create a dummy table and insert data
  db.run('CREATE TABLE products(name text, price real)');
  db.run(`INSERT INTO products(name,price) VALUES(?,?)`, ["Laptop", 1200]);
  db.run(`INSERT INTO products(name,price) VALUES(?,?)`, ["Keyboard", 75]);
});


exports.index = function (req, res, next) {
  Todo.
    find({}).
    sort('-updated_at').
    exec(function (err, todos) {
      if (err) return next(err);

      res.render('index', {
        title: 'Goof TODO',
        subhead: 'Vulnerabilities at their best',
        todos: todos,
      });
    });
};


exports.admin = function (req, res, next) {
  console.log(req.body);
  User.find({ username: req.body.username, password: req.body.password }, function (err, users) {
    if (users.length > 0) {
      return res.render('admin', {
        title: 'Admin Access Granted',
        granted: true,
      });
    } else {
      return res.render('admin', {
        title: 'Admin Access',
        granted: false,
      });
    }
  });

};

function parse(todo) {
  var t = todo;

  var remindToken = ' in ';
  var reminder = t.toString().indexOf(remindToken);
  if (reminder > 0) {
    var time = t.slice(reminder + remindToken.length);
    time = time.replace(/\n$/, '');

    var period = hms(time);

    console.log('period: ' + period);

    // remove it
    t = t.slice(0, reminder);
    if (typeof period != 'undefined') {
      t += ' [' + ms(period) + ']';
    }
  }
  return t;
}

exports.create = function (req, res, next) {
  var item = req.body.content;
  var imgRegex = /\!\[alt text\]\((http.*)\s\".*/;
  if (typeof(item) == 'string' && item.match(imgRegex)) {
    var url = item.match(imgRegex)[1];
    console.log('found img: ' + url);

    exec('identify ' + url, function (err, stdout, stderr) {
      console.log(err);
      if (err !== null) {
        console.log('Error (' + err + '):' + stderr);
      }
    });

  } else {
    item = parse(item);
  }

  new Todo({
      content: item,
      updated_at: Date.now(),
    }).save(function (err, todo, count) {
    if (err) return next(err);
    res.setHeader('Location', '/');
    res.status(302).send(todo.content.toString('base64'));
  });
};

exports.destroy = function (req, res, next) {
  Todo.findById(req.params.id, function (err, todo) {
    try {
      todo.remove(function (err, todo) {
        if (err) return next(err);
        res.redirect('/');
    	});
    } catch(e) {
    }
  });
};

exports.edit = function(req, res, next) {
  Todo.
    find({}).
    sort('-updated_at').
    exec(function (err, todos) {
      if (err) return next(err);
      res.render('edit', {
        title   : 'TODO',
        todos   : todos,
        current : req.params.id
      });
    });
};

exports.update = function(req, res, next) {
  Todo.findById(req.params.id, function (err, todo) {
    todo.content    = req.body.content;
    todo.updated_at = Date.now();
    todo.save(function (err, todo, count) {
      if(err) return next(err);
      res.redirect('/');
    });
  });
};

// ** express turns the cookie key to lowercase **
exports.current_user = function (req, res, next) {
  next();
};

function isBlank(str) {
  return (!str || /^\s*$/.test(str));
}

exports.import = function (req, res, next) {
  if (!req.files) {
    return res.send('No files were uploaded.');
  }

  var importFile = req.files.importFile;
  var data;
  var importedFileType = fileType(importFile.data);
  var zipFileExt = { ext: "zip", mime: "application/zip" };
  if (importedFileType === null) {
    importedFileType = { ext: "txt", mime: "text/plain" };
  }
  if (importedFileType["mime"] === zipFileExt["mime"]) {
    var zip = AdmZip(importFile.data);
    var extracted_path = "/tmp/extracted_files";
    zip.extractAllTo(extracted_path, true);
    data = "No backup.txt file found";
    fs.readFile('backup.txt', 'ascii', function(err, data) {
      if (!err) {
        data = data;
      }});
  } else {
    data = importFile.data.toString('ascii');
  }
  var lines = data.split('\n');
  lines.forEach(function (line) {
    var parts = line.split(',');
    var what = parts[0];
    var when = parts[1];
    var locale = parts[2];
    var format = parts[3];
    var item = what;
    if (!isBlank(what)) {
      if (!isBlank(when) && !isBlank(locale) && !isBlank(format)) {
        moment.locale(locale);
        var d = moment(when);
        item += ' [' + d.format(format) + ']';
      }

      new Todo({
        content: item,
        updated_at: Date.now(),
      }).save(function (err, todo, count) {
        if (err) return next(err);
      });
    }
  });
  res.redirect('/');
};

exports.about_new = function (req, res, next) {
    return res.render("about_new.dust",
      {
        title: 'Goof TODO',
        subhead: 'Vulnerabilities at their best',
        device: req.query.device
      });
};

// ## NEW VULNERABLE FUNCTION FOR SQL INJECTION ##
exports.search = function(req, res, next) {
  const userInput = req.query.q;

  if (!userInput) {
    return res.status(400).send("Please provide a search query with ?q=");
  }
  
  // INSECURE: User input is directly concatenated into the SQL query.
  // This is a classic SQL Injection vulnerability.
  const query = "SELECT * FROM products WHERE name = '" + userInput + "'";
  console.log("Executing query:", query);

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).send("Error executing query.");
    }
    res.json(rows);
  });
};


// Prototype Pollution
const users = [
  {name: 'user', password: 'pwd'},
  {name: 'admin', password: Math.random().toString(32), canDelete: true},
];

let messages = [];
let lastId = 1;

function findUser(auth) {
  return users.find((u) =>
    u.name === auth.name &&
    u.password === auth.password);
}

exports.chat = {
  get(req, res) {
    res.send(messages);
  },
  add(req, res) {
    const user = findUser(req.body.auth || {});
    if (!user) {
      return res.status(403).send({ok: false, error: 'Access denied'});
    }
    const message = { icon: '👋' };
    _.merge(message, req.body.message, {
      id: lastId++,
      timestamp: Date.now(),
      userName: user.name,
    });
    messages.push(message);
    res.send({ok: true});
  },
  delete(req, res) {
    const user = findUser(req.body.auth || {});
    if (!user || !user.canDelete) {
      return res.status(403).send({ok: false, error: 'Access denied'});
    }
    messages = messages.filter((m) => m.id !== req.body.messageId);
    res.send({ok: true});
  }
};
