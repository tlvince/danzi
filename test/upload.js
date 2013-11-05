var assert = require('assert'),
  path = require('path'),
  fs = require('fs'),
  Emitter = require('events').EventEmitter,
  request = require('supertest'),
  express = require('express');

var danzi = require('..');

var uploadPath = __dirname + '/upload';

describe('post request test', function() {
  var app = express();

  app
    .use(express.bodyParser())
    .use(danzi({ path: uploadPath }));

  app.post('/', function(req, res) {
    if (req.files && req.files.hasOwnProperty('file')) {
      res.send(req.files.file.uri);
    }
    else {
      res.json(req.body);
    }
  });

  it('should response to request param', function(done) {
    var param = { name: "test" };
    request(app)
      .post('/')
      .send(param)
      .expect('Content-Type', /json/)
      .expect(200)
      .expect(param, done);
  });

  it('should parse x-www-form-urlencoded', function(done){
    request(app)
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('user=alice')
      .expect({user: "alice"}, done);
  });

  describe('with multipart/form-data', function() {
    it('should populate req.body', function(done) {
      var req = request(app);
      req
        .post('/')
        .field('user', 'Alice')
        .expect({user: "Alice"}, done);
    });
  });

  describe('upload a file', function() {
    it('should have a uploaded file', function(done) {
      request(app)
        .post('/')
        .attach('file', __dirname + '/fixture/fixture.txt')
        .expect(200)
        .end(function(err, res) {
          fs.exists(res.text, function(exists) {
            assert.equal(exists, true);
            done();
          });
        });
    });
  });
});

describe('multi version test', function() {
  var versionMonitor = new Emitter();
  var prefix = 'testfile';
  var nameGenerator = function(file) {
    return prefix + path.extname(file.name);
  };
  var app = express();
  app
    .use(express.bodyParser())
    .use(danzi({ path: uploadPath, nameGenerator: nameGenerator }));

  app.post('/', function(req, res) {
    req.files.file.versions = { thumb: [50, 50] };
    req.files.versionMonitor = versionMonitor;
    res.send(200);
  });

  it('should create multiple versions when asked', function(done) {
    request(app)
      .post('/')
      .attach('file', __dirname + '/fixture/danzi.jpg')
      .end(function(err, res) {
        versionMonitor.on('complete', function() {
          var theFile = path.join(uploadPath, prefix + '-thumb.jpg');
          fs.exists(theFile, function(exists) {
            assert.equal(exists, true);
            done();
          });
        });
    });
  });
});

after(function(done) {
  var files = fs.readdirSync(uploadPath);
  for(var key in files) {
    fs.unlinkSync(uploadPath + '/' + files[key]);
  }
  fs.rmdirSync(uploadPath);
  done();
});
